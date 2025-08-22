Console Error Logging Implementation Plan

1. Console Error Capture Approach

- Intercept console methods: Override console.error and console.warn to capture error messages
- Window error events: Add listeners for window.onerror and window.addEventListener('unhandledrejection') to catch uncaught errors and promise rejections
- Preserve original functionality: Ensure original console behavior remains intact

2. Integration Points

- New ErrorRecorder class: Similar to EventRecorder and SessionRecorder, create a dedicated error recorder in src/recorder/errorRecorder.ts
- Main Recorder coordination: Add error recorder to the main Recorder class (src/recorder/recorder.ts:6-8) alongside session and event recorders
- Reuse existing infrastructure: Leverage the existing buffering, flushing, and API posting patterns from EventRecorder

3. Data Structure

interface ConsoleError {
errorType: "console_error" | "console_warn" | "uncaught_error" | "unhandled_rejection";
message: string;
stack?: string;
timestamp: number;
host: string;
path: string;
source?: string; // file/line info
}

4. Key Implementation Details

- Buffer similar to EventRecorder: Use same 2-second flush interval pattern (eventRecorder.ts:50)
- API endpoint: For now, stub the api call out. But it will be something like: /public/captured-sessions/{id}/console-errors
- Privacy considerations: Respect masking levels - potentially filter sensitive error messages
- Memory management: Limit buffer size to prevent memory bloat from excessive errors

5. Integration Flow

1. ErrorRecorder starts when main Recorder starts
2. Intercepts console calls and error events
3. Buffers error events with timestamps and context
4. Flushes to server using existing request infrastructure
5. Stops when main Recorder stops

Don't worry about tests for now, we will tackle that later.