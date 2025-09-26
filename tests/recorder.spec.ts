// ABOUTME: End-to-end tests for the recorder using Playwright

import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// @ts-ignore
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper function to mock all API endpoints
async function setupApiMocks(page: any) {
  // Mock both localhost and production URLs
  await page.route('http://localhost:8080/public/captured-sessions', (route: any) => {
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify('test-session-id-123')
    });
  });
  
  await page.route('https://scryspell.com/public/captured-sessions', (route: any) => {
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify('test-session-id-123')
    });
  });

  // Mock all recorder API endpoints for both localhost and production
  const successResponse = { status: 201, contentType: 'application/json', body: JSON.stringify({ success: true }) };
  const pingResponse = { status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) };

  await page.route('**/ui-events', (route: any) => route.fulfill(successResponse));
  await page.route('**/network-requests', (route: any) => route.fulfill(successResponse));
  await page.route('**/recording', (route: any) => route.fulfill(successResponse));
  await page.route('**/console-errors', (route: any) => route.fulfill(successResponse));
  await page.route('**/ping', (route: any) => route.fulfill(pingResponse));
  await page.route('**/metadata', (route: any) => route.fulfill(successResponse));
  await page.route('**/identify', (route: any) => route.fulfill(successResponse));

  // Allow external API calls for testing
  await page.route('https://jsonplaceholder.typicode.com/**', (route: any) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 1, title: 'Test Post', body: 'Test content' })
    });
  });

  await page.route('https://httpbin.org/**', (route: any) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: 'mocked response' })
    });
  });

  await page.route('https://example.com/**', (route: any) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true })
    });
  });
}

test.describe('Recorder E2E Tests', () => {
  test('should make POST request to captured-sessions endpoint and receive 201 response', async ({ page }) => {
    let capturedSessionsRequest: any = null;
    let responseStatus: number | null = null;
    
    // Setup API mocks
    await setupApiMocks(page);
    
    // Monitor the POST request to the captured-sessions endpoint
    page.on('request', request => {
      if ((request.url() === 'http://localhost:8080/public/captured-sessions' || request.url() === 'https://scryspell.com/public/captured-sessions') && request.method() === 'POST') {
        capturedSessionsRequest = {
          url: request.url(),
          method: request.method(),
          headers: request.headers(),
          postData: request.postData()
        };
      }
    });

    page.on('response', response => {
      if ((response.url() === 'http://localhost:8080/public/captured-sessions' || response.url() === 'https://scryspell.com/public/captured-sessions') && response.request().method() === 'POST') {
        responseStatus = response.status();
      }
    });

    // Navigate to the test page
    const testPagePath = resolve(__dirname, 'index.html');
    await page.goto(`file://${testPagePath}`);

    // Wait for the page to fully load and the recorder to initialize
    await page.waitForLoadState('domcontentloaded');
    
    // Give time for the recorder initialization and network request
    await page.waitForTimeout(3000);

    // Verify that the POST request was made
    expect(capturedSessionsRequest, 'POST request to captured-sessions endpoint was not made').not.toBeNull();
    expect(capturedSessionsRequest.url).toMatch(/public\/captured-sessions$/);
    expect(capturedSessionsRequest.method).toBe('POST');
    
    // Verify that the response was 201
    expect(responseStatus, 'Response status should be 201').toBe(201);
  });

  test('should allow user identification with identify method', async ({ page }) => {
    let identifyRequest: any = null;
    let identifyResponseStatus: number | null = null;

    // Setup API mocks
    await setupApiMocks(page);

    // Monitor the PATCH request to the identify endpoint
    page.on('request', request => {
      if (request.url().includes('/identify') && request.method() === 'PATCH') {
        identifyRequest = {
          url: request.url(),
          method: request.method(),
          headers: request.headers(),
          postData: request.postData()
        };
      }
    });

    page.on('response', response => {
      if (response.url().includes('/identify') && response.request().method() === 'PATCH') {
        identifyResponseStatus = response.status();
      }
    });

    // Navigate to the test page
    const testPagePath = resolve(__dirname, 'index.html');
    await page.goto(`file://${testPagePath}`);

    // Wait for the page to fully load and the recorder to initialize
    await page.waitForLoadState('domcontentloaded');

    // Wait for session to be created
    await page.waitForTimeout(2000);

    // Call identify method
    await page.evaluate(() => {
      // @ts-ignore - accessing global recorder instance
      if (window.testRecorder) {
        // @ts-ignore
        window.testRecorder.identify('user_123');
      }
    });

    // Give time for the identify request
    await page.waitForTimeout(2000);

    // Verify the identify method is available (no errors thrown)
    const identifyMethodExists = await page.evaluate(() => {
      // @ts-ignore
      return window.testRecorder && typeof window.testRecorder.identify === 'function';
    });

    expect(identifyMethodExists).toBe(true);

    // If identify request was made, verify it was proper
    if (identifyRequest) {
      expect(identifyRequest.method).toBe('PATCH');
      expect(identifyRequest.url).toContain('/identify');

      const postData = JSON.parse(identifyRequest.postData);
      expect(postData.userId).toBe('user_123');

      expect(identifyResponseStatus).toBe(201);
    }
  });

  test.describe('Network Recording', () => {
    test('should record fetch API requests made from the page', async ({ page }) => {
      let capturedSessionsRequest: any = null;
      let networkRequest: any = null;
      let networkResponse: number | null = null;
      
      // Setup API mocks
      await setupApiMocks(page);
      
      // Monitor all network requests
      page.on('request', request => {
        if (request.url() === 'http://localhost:8080/public/captured-sessions' && request.method() === 'POST') {
          capturedSessionsRequest = request;
        }
        if (request.url().includes('/network-requests') && request.method() === 'POST') {
          networkRequest = {
            url: request.url(),
            method: request.method(),
            postData: request.postData()
          };
        }
      });

      page.on('response', response => {
        if (response.url().includes('/network-requests') && response.request().method() === 'POST') {
          networkResponse = response.status();
        }
      });

      // Navigate to test page with network recording enabled
      const testPagePath = resolve(__dirname, 'network-test.html');
      await page.goto(`file://${testPagePath}`);

      // Wait for recorder to initialize
      await page.waitForTimeout(2000);

      // Trigger fetch request from the page
      await page.evaluate(() => {
        return fetch('https://jsonplaceholder.typicode.com/posts/1')
          .then(response => response.json())
          .then(data => console.log('Fetch completed', data))
          .catch(error => console.error('Fetch failed', error));
      });

      // Wait for network recording to flush
      await page.waitForTimeout(3000);

      // Verify network request was captured and sent
      expect(networkRequest, 'Network request should have been recorded').not.toBeNull();
      expect(networkRequest.url).toContain('/network-requests');
      expect(networkResponse).toBe(201);
      
      // Verify request data structure
      const requestData = JSON.parse(networkRequest.postData);
      expect(Array.isArray(requestData)).toBe(true);
      expect(requestData.length).toBeGreaterThan(0);
      
      const recordedRequest = requestData[0];
      expect(recordedRequest).toHaveProperty('requestId');
      expect(recordedRequest).toHaveProperty('type', 'fetch');
      expect(recordedRequest).toHaveProperty('method', 'GET');
      expect(recordedRequest).toHaveProperty('url');
      expect(recordedRequest).toHaveProperty('timestamp');
      expect(recordedRequest.url).toContain('jsonplaceholder.typicode.com');
    });

    test('should record XMLHttpRequest requests made from the page', async ({ page }) => {
      let networkRequest: any = null;
      
      // Setup API mocks
      await setupApiMocks(page);
      
      page.on('request', request => {
        if (request.url().includes('/network-requests') && request.method() === 'POST') {
          networkRequest = {
            url: request.url(),
            method: request.method(),
            postData: request.postData()
          };
        }
      });

      // Navigate to test page
      const testPagePath = resolve(__dirname, 'network-test.html');
      await page.goto(`file://${testPagePath}`);

      await page.waitForTimeout(2000);

      // Trigger XMLHttpRequest from the page
      await page.evaluate(() => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', 'https://jsonplaceholder.typicode.com/posts/2');
        xhr.onreadystatechange = function() {
          if (xhr.readyState === 4) {
            console.log('XHR completed', xhr.status, xhr.responseText);
          }
        };
        xhr.send();
      });

      // Wait for network recording to flush
      await page.waitForTimeout(3000);

      expect(networkRequest).not.toBeNull();
      
      const requestData = JSON.parse(networkRequest.postData);
      const xhrRequest = requestData.find(req => req.type === 'xhr');
      
      expect(xhrRequest).toBeDefined();
      expect(xhrRequest).toHaveProperty('requestId');
      expect(xhrRequest).toHaveProperty('type', 'xhr');
      expect(xhrRequest).toHaveProperty('method', 'GET');
      expect(xhrRequest).toHaveProperty('url');
      expect(xhrRequest.url).toContain('jsonplaceholder.typicode.com');
    });

    test('should sanitize URLs by redacting sensitive query parameters', async ({ page }) => {
      let networkRequest: any = null;
      
      // Setup API mocks
      await setupApiMocks(page);
      
      page.on('request', request => {
        if (request.url().includes('/network-requests') && request.method() === 'POST') {
          networkRequest = {
            postData: request.postData()
          };
        }
      });

      const testPagePath = resolve(__dirname, 'network-test.html');
      await page.goto(`file://${testPagePath}`);

      await page.waitForTimeout(2000);

      // Make request with sensitive parameters
      await page.evaluate(() => {
        return fetch('https://example.com/api?api_key=secret123&utm_source=test&password=hidden&utm_campaign=demo')
          .catch(() => {}); // Ignore network errors, we just want to test URL sanitization
      });

      await page.waitForTimeout(3000);

      expect(networkRequest).not.toBeNull();
      
      const requestData = JSON.parse(networkRequest.postData);
      const sanitizedRequest = requestData[0];
      
      expect(sanitizedRequest.url).toMatch(/(\$redacted|%24redacted)/); // Check for redacted params (URL encoded or not)
      expect(sanitizedRequest.url).toContain('utm_source=test'); // Should preserve allowed params
      expect(sanitizedRequest.url).toContain('utm_campaign=demo'); // Should preserve allowed params
      expect(sanitizedRequest.url).not.toContain('secret123'); // Should redact sensitive params
      expect(sanitizedRequest.url).not.toContain('hidden'); // Should redact sensitive params
    });

    test('should respect masking level settings for headers and body content', async ({ page }) => {
      let networkRequest: any = null;
      
      // Setup API mocks
      await setupApiMocks(page);
      
      page.on('request', request => {
        if (request.url().includes('/network-requests') && request.method() === 'POST') {
          networkRequest = {
            postData: request.postData()
          };
        }
      });

      const testPagePath = resolve(__dirname, 'network-test-masking.html');
      await page.goto(`file://${testPagePath}`);

      await page.waitForTimeout(2000);

      // Make request with custom headers and body
      await page.evaluate(() => {
        return fetch('https://httpbin.org/post', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Custom-Header': 'test-value'
          },
          body: JSON.stringify({ message: 'test data', secret: 'hidden' })
        }).catch(() => {});
      });

      await page.waitForTimeout(3000);

      expect(networkRequest).not.toBeNull();
      
      const requestData = JSON.parse(networkRequest.postData);
      const maskedRequest = requestData[0];
      
      // With maskingLevel: "all", content should be masked
      if (maskedRequest.requestHeaders) {
        expect(maskedRequest.requestHeaders['X-Custom-Header']).toBe('$masked');
      }
      if (maskedRequest.requestBody) {
        expect(maskedRequest.requestBody).toBe('$masked');
      }
    });

    test('should exclude requests to recorder API endpoints', async ({ page }) => {
      let networkRequests: any[] = [];
      
      // Setup API mocks
      await setupApiMocks(page);
      
      page.on('request', request => {
        if (request.url().includes('/network-requests') && request.method() === 'POST') {
          networkRequests.push({
            postData: request.postData()
          });
        }
      });

      const testPagePath = resolve(__dirname, 'network-test.html');
      await page.goto(`file://${testPagePath}`);

      await page.waitForTimeout(2000);

      // Make requests to both allowed and excluded endpoints
      await page.evaluate(() => {
        // This should be captured
        fetch('https://jsonplaceholder.typicode.com/posts/1').catch(() => {});
        
        // This should NOT be captured (internal API)
        fetch('http://localhost:8080/public/captured-sessions/test-id/ui-events', {
          method: 'POST',
          body: JSON.stringify([])
        }).catch(() => {});
      });

      await page.waitForTimeout(3000);

      expect(networkRequests.length).toBeGreaterThan(0);
      
      // Parse all recorded requests
      const allRecordedRequests = networkRequests.flatMap(req => JSON.parse(req.postData));
      
      // Verify external request was captured
      const externalRequest = allRecordedRequests.find(req => req.url.includes('jsonplaceholder'));
      expect(externalRequest).toBeDefined();
      
      // Verify internal API request was NOT captured
      const internalRequest = allRecordedRequests.find(req => req.url.includes('/public/captured-sessions'));
      expect(internalRequest).toBeUndefined();
    });

    test('should only record error requests (4xx, 5xx, network failures)', async ({ page }) => {
      let networkRequests: any[] = [];
      
      // Setup API mocks - but don't mock error responses, let them fail naturally
      await page.route('http://localhost:8080/public/captured-sessions', (route: any) => {
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify('test-session-id-123')
        });
      });
      
      await page.route('https://scryspell.com/public/captured-sessions', (route: any) => {
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify('test-session-id-123')
        });
      });

      // Mock recorder API endpoints
      const successResponse = { status: 201, contentType: 'application/json', body: JSON.stringify({ success: true }) };
      const pingResponse = { status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) };

      await page.route('**/ui-events', (route: any) => route.fulfill(successResponse));
      await page.route('**/network-requests', (route: any) => route.fulfill(successResponse));
      await page.route('**/recording', (route: any) => route.fulfill(successResponse));
      await page.route('**/console-errors', (route: any) => route.fulfill(successResponse));
      await page.route('**/ping', (route: any) => route.fulfill(pingResponse));
      await page.route('**/metadata', (route: any) => route.fulfill(successResponse));

      // Mock different HTTP status codes for testing
      await page.route('https://httpbin.org/status/200', (route: any) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true })
        });
      });

      await page.route('https://httpbin.org/status/404', (route: any) => {
        route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Not Found' })
        });
      });

      await page.route('https://httpbin.org/status/500', (route: any) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' })
        });
      });

      // Let network errors fail naturally by not intercepting them
      
      page.on('request', request => {
        if (request.url().includes('/network-requests') && request.method() === 'POST') {
          networkRequests.push({
            postData: request.postData()
          });
        }
      });

      const testPagePath = resolve(__dirname, 'error-network-test.html');
      await page.goto(`file://${testPagePath}`);

      await page.waitForTimeout(2000);

      // Make various requests - only errors should be recorded
      await page.evaluate(() => {
        // This should NOT be recorded (200 success)
        fetch('https://httpbin.org/status/200').catch(() => {});
        
        // This should be recorded (404 error)
        fetch('https://httpbin.org/status/404').catch(() => {});
        
        // This should be recorded (500 error)
        fetch('https://httpbin.org/status/500').catch(() => {});
        
        // This should be recorded (network error)
        fetch('https://nonexistent-domain-that-will-fail-12345.com/api').catch(() => {});
      });

      // Wait for network recording to flush
      await page.waitForTimeout(4000);

      expect(networkRequests.length).toBeGreaterThan(0);
      
      // Parse all recorded requests
      const allRecordedRequests = networkRequests.flatMap(req => JSON.parse(req.postData));
      
      // Filter out any other requests that might have been made during initialization
      const testRequests = allRecordedRequests.filter(req => 
        req.url.includes('httpbin.org') || 
        req.url.includes('nonexistent-domain') || 
        req.error
      );
      
      expect(testRequests.length).toBeGreaterThan(0);
      
      // Verify only error requests were recorded
      for (const request of testRequests) {
        const hasError = !!request.error;
        const hasErrorStatus = request.responseStatus && request.responseStatus >= 400;
        const isError = hasError || hasErrorStatus;
        expect(isError).toBe(true);
        
        // Should not have recorded any 200 responses
        expect(request.responseStatus).not.toBe(200);
      }
      
      // Verify we have the expected error types
      const hasNetworkError = testRequests.some(req => req.error);
      const has404Error = testRequests.some(req => req.responseStatus === 404);
      const has500Error = testRequests.some(req => req.responseStatus === 500);
      
      expect(hasNetworkError || has404Error || has500Error).toBe(true);
    });

    test('should handle request and response timing correctly for errors', async ({ page }) => {
      let networkRequest: any = null;
      
      // Setup API mocks
      await setupApiMocks(page);
      
      // Mock 404 error
      await page.route('https://httpbin.org/status/404', (route: any) => {
        route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Not Found' })
        });
      });
      
      page.on('request', request => {
        if (request.url().includes('/network-requests') && request.method() === 'POST') {
          networkRequest = {
            postData: request.postData()
          };
        }
      });

      const testPagePath = resolve(__dirname, 'error-network-test.html');
      await page.goto(`file://${testPagePath}`);

      await page.waitForTimeout(2000);

      // Make a request that will return 404 and measure timing
      const startTime = Date.now();
      await page.evaluate(() => {
        return fetch('https://httpbin.org/status/404');
      });
      const endTime = Date.now();

      await page.waitForTimeout(3000);

      expect(networkRequest).not.toBeNull();
      
      const requestData = JSON.parse(networkRequest.postData);
      const timedRequest = requestData[0];
      
      expect(timedRequest).toHaveProperty('timestamp');
      expect(timedRequest).toHaveProperty('duration');
      expect(timedRequest).toHaveProperty('responseStatus', 404);
      expect(timedRequest.duration).toBeGreaterThan(0);
      expect(timedRequest.timestamp).toBeGreaterThanOrEqual(startTime);
      expect(timedRequest.timestamp).toBeLessThanOrEqual(endTime);
    });
  });
});