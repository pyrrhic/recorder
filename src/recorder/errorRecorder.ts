// Captures console errors, warnings, and uncaught errors/promise rejections
// Buffers error events and flushes to API endpoint periodically similar to EventRecorder
import {logger} from "../logger";
import {post} from "../requests";

export interface ConsoleError {
    errorType: "console_error" | "console_warn" | "uncaught_error" | "unhandled_rejection";
    message: string;
    stack?: string;
    timestamp: number;
    source?: string; // file/line info
}

export class ErrorRecorder {
    private errorsBuffer: ConsoleError[] = [];
    private isRunning = false;
    private readonly flushIntervalMs = 2000;
    private capturedSessionId: string | undefined;
    private flushTimerId: ReturnType<typeof setTimeout> | null = null;
    private originalConsoleError: typeof console.error;
    private originalConsoleWarn: typeof console.warn;
    private enabled: boolean;

    constructor(private window: Window, consoleErrorSettings?: { enabled: boolean }) {
        this.originalConsoleError = console.error.bind(console);
        this.originalConsoleWarn = console.warn.bind(console);
        this.enabled = consoleErrorSettings?.enabled ?? true; // Default enabled for backwards compatibility
    }

    public start = () => {
        if (this.isRunning || !this.enabled) {
            return;
        }
        this.isRunning = true;
        this.errorsBuffer = [];

        // Intercept console.error
        console.error = (...args: any[]) => {
            this.captureConsoleError("console_error", args);
            this.originalConsoleError(...args);
        };

        // Intercept console.warn
        console.warn = (...args: any[]) => {
            this.captureConsoleError("console_warn", args);
            this.originalConsoleWarn(...args);
        };

        // Capture uncaught errors
        this.window.addEventListener("error", this.handleUncaughtError);

        // Capture unhandled promise rejections
        this.window.addEventListener("unhandledrejection", this.handleUnhandledRejection);

        this.scheduleFlush();
    };

    public stop = () => {
        this.isRunning = false;

        // Restore original console methods
        console.error = this.originalConsoleError;
        console.warn = this.originalConsoleWarn;

        // Remove event listeners
        this.window.removeEventListener("error", this.handleUncaughtError);
        this.window.removeEventListener("unhandledrejection", this.handleUnhandledRejection);

        if (this.flushTimerId) {
            clearTimeout(this.flushTimerId);
            this.flushTimerId = null;
        }
    };

    private captureConsoleError = (errorType: "console_error" | "console_warn", args: any[]) => {
        if (!this.isRunning) {
            return;
        }

        try {
            const message = args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ');

            const error: ConsoleError = {
                errorType,
                message,
                timestamp: Date.now()
            };

            // Try to extract stack trace if available
            if (args.length > 0 && args[0] instanceof Error) {
                error.stack = args[0].stack;
            }

            this.errorsBuffer.push(error);
        } catch (captureError) {
            logger.error("Failed to capture console error", captureError);
        }
    };

    private handleUncaughtError = (event: ErrorEvent) => {
        if (!this.isRunning) {
            return;
        }

        try {
            const error: ConsoleError = {
                errorType: "uncaught_error",
                message: event.message,
                stack: event.error?.stack,
                timestamp: Date.now(),
                source: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined
            };

            this.errorsBuffer.push(error);
        } catch (captureError) {
            logger.error("Failed to capture uncaught error", captureError);
        }
    };

    private handleUnhandledRejection = (event: PromiseRejectionEvent) => {
        if (!this.isRunning) {
            return;
        }

        try {
            let message: string;
            let stack: string | undefined;

            if (event.reason instanceof Error) {
                message = event.reason.message;
                stack = event.reason.stack;
            } else {
                message = String(event.reason);
            }

            const error: ConsoleError = {
                errorType: "unhandled_rejection",
                message,
                stack,
                timestamp: Date.now()
            };

            this.errorsBuffer.push(error);
        } catch (captureError) {
            logger.error("Failed to capture unhandled rejection", captureError);
        }
    };

    private scheduleFlush = () => {
        if (this.flushTimerId) {
            clearTimeout(this.flushTimerId);
        }
        this.flushTimerId = setTimeout(this.flush, this.flushIntervalMs);
    };

    private flush = async () => {
        if (this.errorsBuffer.length > 0 && this.capturedSessionId) {
            try {
                const response = await post(`/public/captured-sessions/${this.capturedSessionId}/console-errors`, this.errorsBuffer, { withCredentials: false });
                this.errorsBuffer = [];
            } catch (error) {
                logger.error("Failed to flush console errors", error);
                this.errorsBuffer = [];
            }
        }
        this.scheduleFlush();
    };

    public setCapturedSessionId(uuid: string) {
        this.capturedSessionId = uuid;
    }
}