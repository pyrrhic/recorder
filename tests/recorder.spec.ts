// ABOUTME: End-to-end tests for the recorder using Playwright

import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// @ts-ignore
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test.describe('Recorder E2E Tests', () => {
  test('should make POST request to captured-sessions endpoint and receive 201 response', async ({ page }) => {
    let capturedSessionsRequest: any = null;
    let responseStatus: number | null = null;
    
    // Monitor the POST request to the captured-sessions endpoint
    page.on('request', request => {
      if (request.url() === 'http://localhost:8080/public/captured-sessions' && request.method() === 'POST') {
        capturedSessionsRequest = {
          url: request.url(),
          method: request.method(),
          headers: request.headers(),
          postData: request.postData()
        };
      }
    });

    page.on('response', response => {
      if (response.url() === 'http://localhost:8080/public/captured-sessions' && response.request().method() === 'POST') {
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
    expect(capturedSessionsRequest.url).toBe('http://localhost:8080/public/captured-sessions');
    expect(capturedSessionsRequest.method).toBe('POST');
    
    // Verify that the response was 201
    expect(responseStatus, 'Response status should be 201').toBe(201);
  });
});