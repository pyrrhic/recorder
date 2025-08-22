Console Error Logging Implementation Plan

1. Console Error Capture Approach

- Intercept console methods: Override console.error, console.warn, and console.log to capture error messages
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
- API endpoint: Create new endpoint like /public/captured-sessions/{id}/console-errors
- Privacy considerations: Respect masking levels - potentially filter sensitive error messages
- Memory management: Limit buffer size to prevent memory bloat from excessive errors

5. Integration Flow

1. ErrorRecorder starts when main Recorder starts
2. Intercepts console calls and error events
3. Buffers error events with timestamps and context
4. Flushes to server using existing request infrastructure
5. Stops when main Recorder stops

This approach maintains consistency with your existing architecture while adding comprehensive error tracking capabilities.











Network Request Recording Implementation Plan

1. Network Interception Strategy

- XMLHttpRequest patching: Override XMLHttpRequest.prototype.open/send to capture all XHR requests
- Fetch API interception: Override window.fetch to capture modern fetch requests
- Axios integration: Since you're using Axios internally, add interceptors to capture your own API calls
- WebSocket support: Optionally capture WebSocket connections for complete network visibility

2. Data Structure

interface NetworkRequest {
requestId: string; // unique identifier to match request/response
type: "xhr" | "fetch" | "websocket";
method: string; // GET, POST, etc.
url: string; // sanitized URL
requestHeaders?: Record<string, string>; // filtered headers
requestBody?: string; // sanitized request payload
responseStatus?: number;
responseHeaders?: Record<string, string>; // filtered headers  
responseBody?: string; // sanitized response payload
timestamp: number; // request start time
duration?: number; // request duration in ms
host: string;
path: string;
error?: string; // network error details
}

3. Privacy & Security Considerations

- URL sanitization: Apply same query param filtering as EventRecorder (eventRecorder.ts:153-168)
- Header filtering: Whitelist safe headers, redact Authorization, Cookie, etc.
- Body content filtering:
    - Respect masking levels from RecorderSettings
    - Redact sensitive fields (passwords, tokens, PII)
    - Size limits to prevent memory bloat
- Self-exclusion: Don't record requests to your own recording API endpoints

4. Integration Architecture

- New NetworkRecorder class: src/recorder/networkRecorder.ts following existing patterns
- Main Recorder integration: Add to Recorder class alongside session/event recorders
- Shared infrastructure: Reuse buffering, flushing, and API posting from existing recorders
- API endpoint: /public/captured-sessions/{id}/network-requests

5. Implementation Details

class NetworkRecorder {
private requestsBuffer: NetworkRequest[] = [];
private pendingRequests = new Map<string, Partial<NetworkRequest>>();
private originalFetch: typeof fetch;
private originalXHROpen: typeof XMLHttpRequest.prototype.open;
// ... similar to EventRecorder pattern

    public start() {
      this.patchFetch();
      this.patchXHR();
      this.scheduleFlush(); // 2s interval like others
    }
}

6. Key Features

- Request/Response correlation: Match requests with responses using unique IDs
- Performance metrics: Capture timing information for debugging slow requests
- Error capture: Record failed requests, timeouts, and network errors
- Filtering options: Allow developers to exclude certain domains/endpoints
- Size management: Limit buffer size and individual request/response sizes

7. Configuration Options

interface RecorderSettings {
// existing settings...
networkRecording?: {
enabled: boolean;
maxRequestBodySize: number; // default 10KB
maxResponseBodySize: number; // default 50KB  
excludeDomains: string[]; // domains to ignore
captureHeaders: boolean; // default false for privacy
captureRequestBodies: boolean; // default false for privacy
captureResponseBodies: boolean; // default true for debugging
};
}

This approach provides comprehensive network debugging capabilities while maintaining your existing architecture patterns and privacy considerations.