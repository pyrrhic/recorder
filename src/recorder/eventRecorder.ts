import {logger} from "../logger";
import {post} from "../requests";
import {type RecorderSettings} from "./recorder";
import {assertNever} from "../utils";

export interface InteractionEvent {
    eventType: string | "click" | "keydown" | "page_view" | "change" | "submit";
    tagName?: string | null;
    timestamp: number;
    host: string;
    path: string;
    text: string | null;
    domContext?: JsonNode[];
    queryParams?: [string, string][];
}

export interface ClickEvent extends InteractionEvent {
    eventType: "click";
}

export interface KeyEvent extends InteractionEvent {
    eventType: "keydown";
    key: string;
}

export interface JsonNode {
    tag: string;
    attrs: Record<string, string>;
}

export class EventRecorder {
    private eventsBuffer: InteractionEvent[] = [];
    private isRunning = false;
    private tagsToCapture = new Set<string>(["button", "a", "select", "textarea", "input"]);
    private queryParamsAllowed = new Set<string>([
        "utm_source",
        "source",
        "ref",
        "utm_medium",
        "medium",
        "utm_campaign",
        "campaign",
        "utm_content",
        "content",
        "utm_term",
        "term"
    ]);

    // private piiAttribute = "data-pii";
    private readonly flushIntervalMs = 2000;
    private capturedSessionId: string | undefined;
    private flushTimerId: ReturnType<typeof setTimeout> | null = null;

    constructor(private window: Window, private recorderSettings: RecorderSettings) {}

    public start = () => {
        if (this.isRunning) {
            return;
        }
        this.isRunning = true;
        this.eventsBuffer = [];

        const originalPushState = this.window.history.pushState.bind(this.window.history);
        this.window.history.pushState = (data: any, unused: string, url?: string | URL | null) => {
            let urlString = "";
            if (url instanceof URL) {
                urlString = url.toString();
            } else if (url) {
                urlString = url;
            } else {
                urlString = "";
            }

            this.handlePageView(urlString);
            return originalPushState(data, unused, url);
        }

        this.window.addEventListener("pageshow", (e) => {
                try {
                    this.handlePageView(this.window.location.pathname);
                } catch (error) {
                    logger.error("Failed to capture URL change event", error);
                }
            });
        this.window.addEventListener("change", this.handler);
        this.window.addEventListener("click", this.handler);
        this.window.addEventListener("keydown", this.handler);

        this.scheduleFlush();
    };

    private scheduleFlush = () => {
        if (this.flushTimerId) {
            clearTimeout(this.flushTimerId);
        }
        this.flushTimerId = setTimeout(this.flush, this.flushIntervalMs);
    };

    private flush = async () => {
        if (this.eventsBuffer.length > 0 && this.capturedSessionId) {
            try {
                const response = await post(`/public/captured-sessions/${this.capturedSessionId}/ui-events`, this.eventsBuffer, { withCredentials: false });
                if (response.status !== 201) {
                    logger.error("Failed to save ui events", response.data);
                }
                this.eventsBuffer = [];
            } catch (error) {
                logger.error("Failed to save ui events", error);
                this.eventsBuffer = [];
            }
        }
        this.scheduleFlush();
    };

    private handlePageView = (path: string) => {
        if (!this.isRunning) {
            return;
        }
        try {
            const timestamp = Date.now();

            const isPathAbsolute = path.charAt(0) === "/";
            if (!isPathAbsolute) {
                path = this.window.location.pathname + "/" + path;
            }

            const url = new URL(this.window.location.protocol + "//" + this.window.location.host + path + this.window.location.search);

            const sanitizedUrlString = this.sanitizeUrlParams(url.toString(), this.queryParamsAllowed);
            const sanitizedUrl = new URL(sanitizedUrlString);
            const searchParamsArray = Array.from(sanitizedUrl.searchParams);

            const interactionEvent = {
                eventType: "page_view",
                timestamp,
                text: path,
                host: sanitizedUrl.hostname,
                path,

            } as InteractionEvent

            if (searchParamsArray.length > 0) {
                interactionEvent.queryParams = searchParamsArray;
            }

            this.eventsBuffer.push(interactionEvent);

        } catch (error) {
            logger.error("Failed to capture URL change event", error);
        }
    };

    private sanitizeUrlParams = (url: string, paramsAllowed: Set<string>) => {
        try {
            const urlObj = new URL(url);
            for (const key of urlObj.searchParams.keys()) {
                if (!paramsAllowed.has(key.toLowerCase())) {
                    urlObj.searchParams.set(key, "$redacted");
                }
            }

            return urlObj.toString();
        } catch (e) {
            logger.error("Failed to sanitize URL params", e);
            return url;
        }

    }

    private handler = (e: Event) => {
        if (!this.isRunning) {
            return;
        }
        try {
            const eventType = e.type;
            const target = e.target as HTMLElement | null;
            const tagName = target?.tagName.toLowerCase();

            if (!(tagName && this.tagsToCapture.has(tagName))) {
                return;
            }

            const url = new URL(this.window.location.href);
            const host = url.hostname;
            const path = url.pathname;
            const timestamp = Date.now();
            const domContext = this.captureDomContext(target as HTMLElement);

            switch (e.type) {
                case "click":
                    const clickEvent = this.handleClick(target, tagName, timestamp, host, path);
                    this.eventsBuffer.push(clickEvent);
                    break;
                case "keydown":
                    const keyEvent = this.handleKeyDown(e, tagName, target, timestamp, host, path);
                    this.eventsBuffer.push(keyEvent);
                    break;
                case "change":
                    const changeEvent = this.handleChange(target, tagName, timestamp, host, path);
                    this.eventsBuffer.push(changeEvent);
                    break;
                default:
                    this.eventsBuffer.push({
                        eventType,
                        tagName,
                        timestamp,
                        host,
                        path,
                        text: null,
                        domContext
                    });
            }
        } catch (error) {
            logger.error("Failed to capture event", error);
        }
    };

    private handleChange(target: HTMLElement | null | HTMLSelectElement,
                         tagName: string,
                         timestamp: number,
                         host: string,
                         path: string): InteractionEvent {
        let text: string | null = null;
        if (target instanceof HTMLSelectElement) {
            text = target.options[target.selectedIndex].text;
        }

        switch (this.recorderSettings.maskingLevel) {
            case "none":
                break;
            case "all":
                text = null;
                break;
            case "input-and-textarea":
                break;
            case "input-password-or-email-and-textarea":
                break;
            default:
                text = null;
        }

        return {
            eventType: "change",
            tagName,
            timestamp,
            text: text === "" ? null : text,
            host,
            path,
            domContext: this.captureDomContext(target as HTMLElement)
        };
    }

    private handleClick(target: HTMLElement | null | HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement | HTMLAnchorElement | HTMLImageElement,
                        tagName: string, timestamp: number, host: string, path: string): ClickEvent {
        let text: string | null = "";
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
            const labelText = this.findInputOrSelectOrTextAreaLabel(target);
            if (labelText) {
                text = labelText;
            } else if (target.placeholder) {
                text = target.placeholder;
            }
        } else if (target instanceof HTMLSelectElement) {
            const labelText = this.findInputOrSelectOrTextAreaLabel(target);
            if (labelText) {
                text = labelText;
            } else {
                text = target.value + " (" + target.options[target.selectedIndex].text + ")";
            }
        } else if (target instanceof HTMLButtonElement) {
            text = target.innerText;
        } else if (target instanceof HTMLAnchorElement) {
            text = target.href;
        } else if (target instanceof HTMLImageElement) {
            text = target.src;
        }

        switch (this.recorderSettings.maskingLevel) {
            case "none":
                break;
            case "all":
                text = null;
                break;
            case "input-and-textarea":
                if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
                    text = null;
                }
                break;
            case "input-password-or-email-and-textarea":
                if (target instanceof HTMLTextAreaElement) {
                    text = null;
                } else if (target instanceof HTMLInputElement) {
                    if (target.type === "password" || target.type === "email" || target.type === "e-mail") {
                        text = null;
                    }
                }
                break;
            default:
                text = null;
        }

        return {
            eventType: "click",
            tagName,
            timestamp,
            text: text === "" ? null : text,
            host,
            path,
            domContext: this.captureDomContext(target as HTMLElement)
        };
    }

    private handleKeyDown(e: Event,
                          tagName: string,
                          target: HTMLElement | null | HTMLInputElement | HTMLTextAreaElement,
                          timestamp: number,
                          host: string, path: string): KeyEvent {
        const kbe = e as KeyboardEvent;
        const key = kbe.key;

        let text: string | null = null;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
            const labelText = this.findInputOrSelectOrTextAreaLabel(target);
            if (labelText) {
                text = labelText;
            } else if (target.placeholder) {
                text = target.placeholder;
            }
        }

        switch (this.recorderSettings.maskingLevel) {
            case "none":
                break;
            case "all":
                text = null;
                break;
            case "input-and-textarea":
                if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
                    text = null;
                }
                break;
            case "input-password-or-email-and-textarea":
                if (target instanceof HTMLTextAreaElement) {
                    text = null;
                } else if (target instanceof HTMLInputElement) {
                    if (target.type === "password" || target.type === "email" || target.type === "e-mail") {
                        text = null;
                    }
                }
                break;
            default:
                text = null;
        }

        return {
            eventType: "keydown",
            tagName,
            timestamp,
            text,
            key,
            host,
            path,
            domContext: this.captureDomContext(target as HTMLElement)
        }
    }

    private findInputOrSelectOrTextAreaLabel = (el: HTMLElement | null): string | null => {
        const allowedTags = new Set(["input", "select", "textarea"]);
        if (!el || !allowedTags.has(el.tagName.toLowerCase())) return null;

        /* 1. <label><input|select …></label> (label wraps the control) */
        const wrappingLabel = el.closest("label");
        if (wrappingLabel) {
            // Take only the TEXT_NODEs that are direct children of <label>
            const text = Array.from(wrappingLabel.childNodes)
                .filter(node => node.nodeName.toLowerCase() !== "select")
                .map(node => (node.textContent ?? "").trim())
                .filter(Boolean)                 // remove empty strings
                .join(" ")
                .trim();

            if (text) return text;
        }

        /* 2. <label for="id">…</label>  +  <input|select id="id" …> */
        const id = (el as HTMLInputElement).id;
        if (id) {
            const explicitLabel = el.ownerDocument.querySelector<HTMLLabelElement>(
                `label[for="${CSS.escape(id)}"]`
            );
            if (explicitLabel) {
                const text = Array.from(explicitLabel.childNodes)
                    .filter(node => node.nodeName.toLowerCase() !== "select")
                    .map(node => (node.textContent ?? "").trim())
                    .filter(Boolean)
                    .join(" ")
                    .trim();

                if (text) return text;
            }
        }

        /* 3. Accessibility fall-backs */
        const ariaLabel = el.getAttribute("aria-label");
        if (ariaLabel) return ariaLabel.trim();

        const ariaLabelledBy = el.getAttribute("aria-labelledby");
        if (ariaLabelledBy) {
            const ref = el.ownerDocument.getElementById(ariaLabelledBy);
            return ref?.textContent?.trim() || null;
        }

        return null;
    }

    public stop = () => {
        this.isRunning = false;
        this.window.removeEventListener("change", this.handler);
        this.window.removeEventListener("click", this.handler);
        this.window.removeEventListener("keydown", this.handler);

        if (this.flushTimerId) {
            clearTimeout(this.flushTimerId);
            this.flushTimerId = null;
        }
    };

    private captureDomContext = (targetElement: HTMLElement): JsonNode[] => {
        const context: JsonNode[] = [];
        context.push(this.toJsonNode(targetElement));

        let current = targetElement.parentElement;
        while (current != null && context.length < 6) {
            context.push(this.toJsonNode(current));
            current = current.parentElement;
        }

        return context;
    }

    private toJsonNode = (node: HTMLElement): JsonNode => {
        const attrs: Record<string, string> = {};

        // Collect safe attributes only
        ["id", "class", "name", "type", "role", "aria-label"].forEach((key) => {
            const val = node.getAttribute(key);
            if (val) attrs[key] = val;
        });

        return {
            tag: node.tagName.toLowerCase(),
            attrs
        };
    }


    public setCapturedSessionId(uuid: string) {
        this.capturedSessionId = uuid;
    }
}
