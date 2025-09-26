import {SessionRecorder} from "./sessionRecorder";
import {EventRecorder} from "./eventRecorder";
import {ErrorRecorder} from "./errorRecorder";
import {NetworkRecorder} from "./networkRecorder";
import {post, put, patch} from "../requests";
import {UAParser} from "ua-parser-js";

export class Recorder {
    private sessionRecorder: SessionRecorder;
    private eventRecorder: EventRecorder;
    private errorRecorder: ErrorRecorder;
    private networkRecorder: NetworkRecorder;
    private recorderSettings: RecorderSettings;
    private capturedSessionId: String | null = null;
    private pingIntervalMs = 20000;
    private pingTimeout: NodeJS.Timeout | null = null;
    private userIdentity: CapturedUserIdentity | null = null;

    constructor(private window: Window, private publicToken: string, userSettings: Partial<RecorderSettings> = {}) {
        // Default settings
        const defaultSettings: RecorderSettings = {
            maskingLevel: "all",
            consoleRecording: { enabled: false },
            networkRecording: {
                enabled: false,
                maxRequestBodySize: 10 * 1024,
                maxResponseBodySize: 50 * 1024,
                excludeDomains: [],
                captureHeaders: true,
                captureRequestBodies: true,
                captureResponseBodies: true,
                excludeHeaders: []
            }
        };

        // Merge user settings with defaults
        this.recorderSettings = {
            ...defaultSettings,
            ...userSettings,
            consoleRecording: {
                ...defaultSettings.consoleRecording,
                ...(userSettings.consoleRecording || {})
            },
            networkRecording: {
                ...defaultSettings.networkRecording,
                ...(userSettings.networkRecording || {})
            }
        };

        this.sessionRecorder = new SessionRecorder(this.recorderSettings);
        this.eventRecorder = new EventRecorder(window, this.recorderSettings);
        this.errorRecorder = new ErrorRecorder(window, this.recorderSettings.consoleRecording);
        this.networkRecorder = new NetworkRecorder(window, this.recorderSettings.networkRecording);

         post(`public/captured-sessions`, { publicToken }, { withCredentials: false })
            .then(response => {
                const id = response.data as string;
                this.capturedSessionId = id;
                this.sessionRecorder.setCapturedSessionId(id);
                this.eventRecorder.setCapturedSessionId(id);
                this.errorRecorder.setCapturedSessionId(id);
                this.networkRecorder.setCapturedSessionId(id);
                this.schedulePing();
                const capturedUserMetadata = this.collectCapturedUserMetadata();
                post(`public/captured-sessions/${this.capturedSessionId}/captured-session/metadata`, capturedUserMetadata, { withCredentials: false });

                // Send user identification if it was set before session creation
                if (this.userIdentity) {
                    this.sendUserIdentification();
                }
            })
            .catch(error => {
                console.error(error);
                this.sessionRecorder.stop();
                this.eventRecorder.stop();
                this.errorRecorder.stop();
                this.networkRecorder.stop();
            })
    }

    private schedulePing() {
        if (this.pingTimeout) {
            clearTimeout(this.pingTimeout);
        }

        this.pingTimeout = setTimeout(this.ping, this.pingIntervalMs);
    }

    private ping = async () => {
        await put(`public/captured-sessions/${this.capturedSessionId}/ping`, {}, { withCredentials: false });

        this.schedulePing();
    }

    /**
     * Start all recorders
     */
    public start() {
        this.sessionRecorder.start();
        this.eventRecorder.start();
        this.errorRecorder.start();
        this.networkRecorder.start();
    }

    /**
     * Stop all recorders
     */
    public stop() {
        this.sessionRecorder.stop();
        this.eventRecorder.stop();
        this.errorRecorder.stop();
        this.networkRecorder.stop();
    }

    /**
     * Identify the current user with a unique ID
     * @param userId - Unique identifier for the user (e.g., database ID, email)
     * @example
     * recorder.identify('user_123');
     */
    public identify(userId: string) {
        if (!userId || typeof userId !== 'string' || userId.trim() === '') {
            console.error('Recorder.identify: userId must be a non-empty string');
            return;
        }

        this.userIdentity = {
            userId: userId.trim()
        };

        // If session is already created, send identification immediately
        if (this.capturedSessionId) {
            this.sendUserIdentification();
        }
        // If not, identification will be sent when session is created
    }

    private async sendUserIdentification() {
        if (!this.capturedSessionId || !this.userIdentity) {
            return;
        }

        try {
            const response = await patch(`public/captured-sessions/${this.capturedSessionId}/identify`, this.userIdentity, { withCredentials: false });

            if (response.status >= 400) {
                console.error(`Failed to identify user: HTTP ${response.status}`, response.data);
            }
        } catch (error) {
            console.error("Error sending user identification:", error);
            // Identification failure is non-critical - recording should continue
        }
    }

    private collectCapturedUserMetadata = (): CapturedUserMetadata => {
        const ua = new UAParser();
        const browserName   = ua.getBrowser().name;
        const browserVersion    = ua.getBrowser().version;
        const osName        = ua.getOS().name;
        const osVersion         = ua.getOS().version;
        const deviceType    = (ua.getDevice().type    ?? "desktop" ) as string; // undefined ⇒ desktop

        const browserLanguage      = navigator.language;
        const browserTimeZone      = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const referringUrl: string | undefined = document.referrer || undefined;
        let   referringDomain;
        try   { referringDomain = referringUrl ? new URL(referringUrl).hostname : undefined }
        catch { /* ignore malformed referrer */ }
        const viewportWidth  = window.innerWidth  || document.documentElement.clientWidth;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        const url = new URL(window.location.href);
        const host = window.location.hostname;

        const utmSource = url.searchParams.get("utm_source") || url.searchParams.get("source") || url.searchParams.get("ref") || undefined;
        const utmMedium = url.searchParams.get("utm_medium") || url.searchParams.get("medium") || undefined;
        const utmCampaign = url.searchParams.get("utm_campaign") || url.searchParams.get("campaign") || undefined;
        const utmContent = url.searchParams.get("utm_content") || url.searchParams.get("content") || undefined;
        const utmTerm = url.searchParams.get("utm_term") || url.searchParams.get("term") || undefined;

        return {
            browserName,
            browserVersion,
            osName,
            osVersion,
            deviceType,
            browserLanguage,
            browserTimeZone,
            referringUrl,
            referringDomain,
            viewportWidth,
            viewportHeight,
            host,
            utmSource,
            utmMedium,
            utmCampaign,
            utmContent,
            utmTerm
        };
    }
}

export interface RecorderSettings {
    maskingLevel: "none" | "all" | "input-and-textarea" | "input-password-or-email-and-textarea";
    consoleRecording: {
        enabled: boolean;
    };
    networkRecording: {
        enabled: boolean;
        maxRequestBodySize: number;
        maxResponseBodySize: number;
        excludeDomains: string[];
        captureHeaders: boolean;
        captureRequestBodies: boolean;
        captureResponseBodies: boolean;
        excludeHeaders: string[];
        requestBodyMaskingFunction?: (body: string) => string;
        responseBodyMaskingFunction?: (body: string) => string;
    };
}

export interface CapturedUserMetadata {
    browserName?: string;
    browserVersion?: string;
    osName?: string;
    osVersion?: string;
    deviceType?: string;
    browserLanguage?: string;
    browserTimeZone?: string;
    referringUrl?: string;
    referringDomain?: string;
    viewportWidth?: number;
    viewportHeight?: number;
    host?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    utmTerm?: string;
}

export interface CapturedUserIdentity {
    userId: string;
}