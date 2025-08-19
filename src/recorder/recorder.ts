import {SessionRecorder} from "./sessionRecorder";
import {EventRecorder} from "./eventRecorder";
import {post, put} from "../requests";
import {UAParser} from "ua-parser-js";

export class Recorder {
    private sessionRecorder: SessionRecorder;
    private eventRecorder: EventRecorder;
    private capturedSessionId: String | null = null;
    private pingIntervalMs = 20000;
    private pingTimeout: NodeJS.Timeout | null = null;

    constructor(private window: Window, private publicToken: string, private recorderSettings: RecorderSettings) {
        if (recorderSettings.maskingLevel == null) {
            recorderSettings.maskingLevel = MaskingLevel.InputAndTextArea;
        }

        this.sessionRecorder = new SessionRecorder(recorderSettings);
        this.eventRecorder = new EventRecorder(window, recorderSettings);

         post(`public/captured-sessions`, { publicToken }, { withCredentials: false })
            .then(response => {
                const id = response.data as string;
                this.capturedSessionId = id;
                this.sessionRecorder.setCapturedSessionId(id);
                this.eventRecorder.setCapturedSessionId(id);
                this.schedulePing();
                const capturedUserMetadata = this.collectCapturedUserMetadata();
                post(`public/captured-sessions/${this.capturedSessionId}/captured-session/metadata`, capturedUserMetadata, { withCredentials: false });
            })
            .catch(error => {
                console.error(error);
                this.sessionRecorder.stop();
                this.eventRecorder.stop();
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
     * Start both recorders
     */
    public start() {
        this.sessionRecorder.start();
        this.eventRecorder.start();
    }

    /**
     * Stop both recorders
     */
    public stop() {
        this.sessionRecorder.stop();
        this.eventRecorder.stop();
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
    maskingLevel: MaskingLevel | null,
}

export enum MaskingLevel {
    None = "none",
    All = "all",
    InputAndTextArea = "input-and-textarea",
    InputPasswordOrEmailAndTextArea = "input-password-or-email-and-textarea"
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