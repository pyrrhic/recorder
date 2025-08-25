import {logger} from "../logger";
import {post} from "../requests";

export interface NetworkRequest {
    requestId: string;
    type: "xhr" | "fetch";
    method: string;
    url: string;
    requestHeaders?: Record<string, string>;
    requestBody?: string;
    responseStatus?: number;
    responseHeaders?: Record<string, string>;
    responseBody?: string;
    timestamp: number;
    duration?: number;
    error?: string;
}

interface NetworkRecorderSettings {
    enabled: boolean;
    maxRequestBodySize: number;
    maxResponseBodySize: number;
    excludeDomains: string[];
    captureHeaders: boolean;
    captureRequestBodies: boolean;
    captureResponseBodies: boolean;
    excludeHeaders: string[];
    requestBodyMaskingFunction?: (body: string) => string;
}

export class NetworkRecorder {
    private requestsBuffer: NetworkRequest[] = [];
    private pendingRequests = new Map<string, Partial<NetworkRequest>>();
    private isRunning = false;
    private readonly flushIntervalMs = 2000;
    private capturedSessionId: string | undefined;
    private flushTimerId: ReturnType<typeof setTimeout> | null = null;

    // Store original implementations
    private originalFetch: typeof fetch;
    private originalXHROpen: typeof XMLHttpRequest.prototype.open;
    private originalXHRSend: typeof XMLHttpRequest.prototype.send;

    // URL sanitization - reuse pattern from EventRecorder
    private queryParamsAllowed = new Set<string>([
        "utm_source", "source", "ref", "utm_medium", "medium",
        "utm_campaign", "campaign", "utm_content", "content", "utm_term", "term"
    ]);

    private networkSettings: NetworkRecorderSettings = {
        enabled: false, // Default disabled
        maxRequestBodySize: 10 * 1024, // 10KB
        maxResponseBodySize: 50 * 1024, // 50KB
        excludeDomains: [],
        captureHeaders: false,
        captureRequestBodies: false,
        captureResponseBodies: true,
        excludeHeaders: []
    };

    constructor(private window: Window, settings?: Partial<NetworkRecorderSettings>) {
        this.originalFetch = this.window.fetch.bind(this.window);
        this.originalXHROpen = XMLHttpRequest.prototype.open;
        this.originalXHRSend = XMLHttpRequest.prototype.send;
        
        if (settings) {
            this.networkSettings = { ...this.networkSettings, ...settings };
        }
    }

    public start = () => {
        if (this.isRunning || !this.networkSettings.enabled) {
            return;
        }
        this.isRunning = true;
        this.requestsBuffer = [];

        this.patchFetch();
        this.patchXHR();
        this.scheduleFlush();
    };

    public stop = () => {
        this.isRunning = false;

        // Restore original implementations
        this.window.fetch = this.originalFetch;
        XMLHttpRequest.prototype.open = this.originalXHROpen;
        XMLHttpRequest.prototype.send = this.originalXHRSend;

        if (this.flushTimerId) {
            clearTimeout(this.flushTimerId);
            this.flushTimerId = null;
        }
    };

    public setCapturedSessionId(uuid: string) {
        this.capturedSessionId = uuid;
    }


    private scheduleFlush = () => {
        if (this.flushTimerId) {
            clearTimeout(this.flushTimerId);
        }
        this.flushTimerId = setTimeout(this.flush, this.flushIntervalMs);
    };

    private flush = async () => {
        if (this.requestsBuffer.length > 0 && this.capturedSessionId) {
            try {
                const response = await post(`/public/captured-sessions/${this.capturedSessionId}/network-requests`, this.requestsBuffer, { withCredentials: false });
                if (response.status !== 201) {
                    logger.error("Failed to save network requests", response.data);
                }
                this.requestsBuffer = [];
            } catch (error) {
                logger.error("Failed to save network requests", error);
                this.requestsBuffer = [];
            }
        }
        this.scheduleFlush();
    };

    private patchFetch = () => {
        const self = this;
        this.window.fetch = async function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
            const requestId = self.generateRequestId();
            const timestamp = Date.now();
            
            let url = "";
            let method = "GET";
            let requestHeaders: Record<string, string> = {};
            let requestBody: string | undefined;

            // Parse input to extract URL and method
            if (typeof input === "string") {
                url = input;
            } else if (input instanceof URL) {
                url = input.toString();
            } else if (input instanceof Request) {
                url = input.url;
                method = input.method;
                if (self.networkSettings.captureHeaders) {
                    input.headers.forEach((value, key) => {
                        requestHeaders[key] = value;
                    });
                }
                if (self.networkSettings.captureRequestBodies && input.body) {
                    try {
                        const clonedRequest = input.clone();
                        requestBody = await clonedRequest.text();
                    } catch (e) {
                        // Body already consumed, skip
                    }
                }
            }

            if (init) {
                method = init.method || method;
                if (self.networkSettings.captureHeaders && init.headers) {
                    if (init.headers instanceof Headers) {
                        init.headers.forEach((value, key) => {
                            requestHeaders[key] = value;
                        });
                    } else if (Array.isArray(init.headers)) {
                        init.headers.forEach(([key, value]) => {
                            requestHeaders[key] = value;
                        });
                    } else {
                        Object.assign(requestHeaders, init.headers);
                    }
                }
                if (self.networkSettings.captureRequestBodies && init.body) {
                    if (typeof init.body === "string") {
                        requestBody = init.body;
                    } else {
                        try {
                            requestBody = JSON.stringify(init.body);
                        } catch (e) {
                            requestBody = "[Unable to serialize body]";
                        }
                    }
                }
            }

            if (!self.shouldCaptureRequest(url)) {
                return self.originalFetch(input, init);
            }

            const sanitizedUrl = self.sanitizeUrl(url);
            const filteredHeaders = self.filterHeaders(requestHeaders);
            const truncatedBody = self.truncateContent(requestBody, self.networkSettings.maxRequestBodySize);

            // Create initial request record
            const networkRequest: Partial<NetworkRequest> = {
                requestId,
                type: "fetch",
                method: method.toUpperCase(),
                url: sanitizedUrl,
                requestHeaders: Object.keys(filteredHeaders).length > 0 ? filteredHeaders : undefined,
                requestBody: truncatedBody,
                timestamp
            };

            self.pendingRequests.set(requestId, networkRequest);

            try {
                const response = await self.originalFetch(input, init);
                const duration = Date.now() - timestamp;
                
                let responseHeaders: Record<string, string> = {};
                let responseBody: string | undefined;

                if (self.networkSettings.captureHeaders) {
                    response.headers.forEach((value, key) => {
                        responseHeaders[key] = value;
                    });
                }

                if (self.networkSettings.captureResponseBodies) {
                    try {
                        const clonedResponse = response.clone();
                        const text = await clonedResponse.text();
                        responseBody = self.truncateContent(text, self.networkSettings.maxResponseBodySize);
                    } catch (e) {
                        responseBody = "[Unable to read response body]";
                    }
                }

                // Complete the request record
                const completedRequest: NetworkRequest = {
                    ...networkRequest as NetworkRequest,
                    responseStatus: response.status,
                    responseHeaders: Object.keys(responseHeaders).length > 0 ? self.filterHeaders(responseHeaders) : undefined,
                    responseBody,
                    duration
                };

                self.addCompletedRequest(requestId, completedRequest);
                return response;

            } catch (error) {
                const duration = Date.now() - timestamp;
                const errorRequest: NetworkRequest = {
                    ...networkRequest as NetworkRequest,
                    error: error instanceof Error ? error.message : String(error),
                    duration
                };

                self.addCompletedRequest(requestId, errorRequest);
                throw error;
            }
        };
    };

    private patchXHR = () => {
        const self = this;
        
        XMLHttpRequest.prototype.open = function(method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null) {
            const xhr = this as XMLHttpRequest & { __networkRecorder?: { requestId: string, timestamp: number, method: string, url: string } };
            
            const urlString = typeof url === "string" ? url : url.toString();
            
            if (self.shouldCaptureRequest(urlString)) {
                const requestId = self.generateRequestId();
                const timestamp = Date.now();
                
                xhr.__networkRecorder = {
                    requestId,
                    timestamp,
                    method: method.toUpperCase(),
                    url: self.sanitizeUrl(urlString)
                };
            }
            
            return self.originalXHROpen.call(this, method, url as string, async ?? true, username, password);
        };

        XMLHttpRequest.prototype.send = function(body?: Document | XMLHttpRequestBodyInit | null) {
            const xhr = this as XMLHttpRequest & { __networkRecorder?: { requestId: string, timestamp: number, method: string, url: string } };
            
            if (xhr.__networkRecorder) {
                const { requestId, timestamp, method, url } = xhr.__networkRecorder;
                
                let requestHeaders: Record<string, string> = {};
                let requestBody: string | undefined;

                if (self.networkSettings.captureRequestBodies && body) {
                    if (typeof body === "string") {
                        requestBody = body;
                    } else {
                        try {
                            requestBody = JSON.stringify(body);
                        } catch (e) {
                            requestBody = "[Unable to serialize body]";
                        }
                    }
                }

                const networkRequest: Partial<NetworkRequest> = {
                    requestId,
                    type: "xhr",
                    method,
                    url,
                    requestHeaders: Object.keys(requestHeaders).length > 0 ? self.filterHeaders(requestHeaders) : undefined,
                    requestBody: self.truncateContent(requestBody, self.networkSettings.maxRequestBodySize),
                    timestamp
                };

                self.pendingRequests.set(requestId, networkRequest);

                // Handle response
                const originalOnReadyStateChange = xhr.onreadystatechange;
                xhr.onreadystatechange = function() {
                    if (xhr.readyState === XMLHttpRequest.DONE) {
                        const duration = Date.now() - timestamp;
                        let responseHeaders: Record<string, string> = {};
                        let responseBody: string | undefined;

                        if (self.networkSettings.captureHeaders) {
                            const headerString = xhr.getAllResponseHeaders();
                            if (headerString) {
                                headerString.split('\r\n').forEach(line => {
                                    const parts = line.split(': ');
                                    if (parts.length === 2) {
                                        responseHeaders[parts[0]] = parts[1];
                                    }
                                });
                            }
                        }

                        if (self.networkSettings.captureResponseBodies) {
                            try {
                                responseBody = self.truncateContent(xhr.responseText, self.networkSettings.maxResponseBodySize);
                            } catch (e) {
                                responseBody = "[Unable to read response]";
                            }
                        }

                        const completedRequest: NetworkRequest = {
                            ...networkRequest as NetworkRequest,
                            responseStatus: xhr.status,
                            responseHeaders: Object.keys(responseHeaders).length > 0 ? self.filterHeaders(responseHeaders) : undefined,
                            responseBody,
                            duration,
                            error: xhr.status === 0 ? "Network error" : undefined
                        };

                        self.addCompletedRequest(requestId, completedRequest);
                    }
                    
                    if (originalOnReadyStateChange) {
                        originalOnReadyStateChange.call(this, new Event('readystatechange'));
                    }
                };
            }
            
            return self.originalXHRSend.call(this, body ?? null);
        };
    };

    private shouldCaptureRequest(url: string): boolean {
        if (!this.isRunning || !this.networkSettings.enabled) {
            return false;
        }

        try {
            const urlObj = new URL(url, this.window.location.href);
            
            // Don't capture requests to our own API endpoints
            if (urlObj.pathname.includes('/public/captured-sessions')) {
                return false;
            }

            // Check excluded domains
            if (this.networkSettings.excludeDomains.some(domain => urlObj.hostname.includes(domain))) {
                return false;
            }

            return true;
        } catch (e) {
            return false;
        }
    }

    private sanitizeUrl(url: string): string {
        try {
            const urlObj = new URL(url, this.window.location.href);
            
            // Apply same sanitization as EventRecorder
            for (const key of urlObj.searchParams.keys()) {
                if (!this.queryParamsAllowed.has(key.toLowerCase())) {
                    urlObj.searchParams.set(key, "$redacted");
                }
            }
            
            return urlObj.toString();
        } catch (e) {
            logger.error("Failed to sanitize URL", e);
            return url;
        }
    }

    private filterHeaders(headers: Record<string, string>): Record<string, string> {
        const filtered: Record<string, string> = {};
        const defaultSensitiveHeaders = new Set([
            'authorization', 'cookie', 'x-api-key', 'x-auth-token', 
            'x-csrf-token', 'x-session-token', 'set-cookie'
        ]);
        
        // Combine default sensitive headers with user-specified excluded headers
        const excludedHeaders = new Set([
            ...defaultSensitiveHeaders,
            ...this.networkSettings.excludeHeaders.map(h => h.toLowerCase())
        ]);

        for (const [key, value] of Object.entries(headers)) {
            if (excludedHeaders.has(key.toLowerCase())) {
                // Don't record excluded headers
                continue;
            }
            filtered[key] = value;
        }

        return filtered;
    }

    private truncateContent(content: string | undefined, maxSize: number): string | undefined {
        if (!content) return content;
        
        // Apply masking function if provided
        let processedContent = content;
        if (this.networkSettings.requestBodyMaskingFunction) {
            processedContent = this.networkSettings.requestBodyMaskingFunction(content);
        }
        
        if (processedContent.length > maxSize) {
            return processedContent.substring(0, maxSize) + `... [truncated from ${processedContent.length} chars]`;
        }
        
        return processedContent;
    }

    private generateRequestId(): string {
        return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    private addCompletedRequest(requestId: string, request: NetworkRequest) {
        this.pendingRequests.delete(requestId);
        this.requestsBuffer.push(request);
    }
}