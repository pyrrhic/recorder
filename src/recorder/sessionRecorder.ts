import {record} from "rrweb";
import {patch} from "../requests";
import {logger} from "../logger";
import type {recordOptions} from "rrweb/typings/types";
import {MaskingLevel, type RecorderSettings} from "./recorder";
import {assertNever} from "../utils";
import type {eventWithTime, listenerHandler} from "@rrweb/types";


export interface SessionBuffer {
    data: any[];
}

export class SessionRecorder {
    private capturedSessionId: string | null = null;
    private buffer: SessionBuffer;
    private stopFn: listenerHandler | undefined;
    private readonly flushIntervalMs: number;
    private flushTimer: NodeJS.Timeout | undefined;

    constructor(private recorderSettings: RecorderSettings) {
        this.buffer = {
            data: []
        };

        this.flushIntervalMs = 2000; // 2 * 1000
    }

    public setCapturedSessionId(id: string) {
        this.capturedSessionId = id;
}

    public start = () => {
        if (Object.assign === undefined) {
            return;
        }
        this.buffer = {
            data: []
        };
        const recordOptions: recordOptions<eventWithTime> = {
            emit: (event) => {
                this.buffer.data.push(event);
            },
            blockClass: "scry-block"
        };

        switch (this.recorderSettings.maskingLevel) {
            case MaskingLevel.None:
                break;
            case MaskingLevel.All:
                recordOptions.maskTextFn = (input: string) => input.replaceAll(/./g, "*");
                break;
            case null:
            case MaskingLevel.InputAndTextArea:
                recordOptions.maskAllInputs = true;
                break;
            case MaskingLevel.InputPasswordOrEmailAndTextArea:
                recordOptions.maskInputOptions = {
                    password: true,
                    email: true,
                    textarea: true
                };
                break;
            default:
                assertNever(this.recorderSettings.maskingLevel);
        }

        this.stopFn = record(recordOptions);
        this.scheduleFlush();
    };

    // separate method for scheduling flush
    private scheduleFlush = () => {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
        }
        this.flushTimer = setTimeout(this.flush, this.flushIntervalMs);
    };

    // preserve data on flush failure
    private flush = async () => {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = undefined;
        }

        if (this.capturedSessionId && this.buffer.data.length > 0) {
            try {
                let response = await patch(`public/captured-sessions/${this.capturedSessionId}/recording`, this.buffer, { withCredentials: false });

                if (response.status >= 400) {
                    logger.error(`status ${response.status} when trying to save session recording data.`);
                    logger.error(response.data);
                } else {
                    // clear buffer only if response was successful
                    this.clearAllBufferData();
                }
            } catch (error) {
                logger.error("Error flushing session data:", error);
                // TODO add a failure count that will eventually stop, so we don't store a ton of data and hog client memory.
                // do not clear the buffer, so we retry next time
            }
        }

        this.scheduleFlush();
    };

    public stop = () => {
        if (this.stopFn) {
            this.stopFn();
        }
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = undefined;
        }
    };

    private clearAllBufferData = () => {
        this.buffer.data = [];
    };
}
