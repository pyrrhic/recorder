Network Request Recording Implementation Plan

1. Network Interception Strategy

- XMLHttpRequest patching: Override XMLHttpRequest.prototype.open/send to capture all XHR requests
- Fetch API interception: Override window.fetch to capture modern fetch requests
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