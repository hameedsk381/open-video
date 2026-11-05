import { describe, expect, it, vi } from 'vitest';
import {
  signWebhookPayload,
  createJobWebhookPayload,
  dispatchWebhook,
  InProcessQueue,
} from '@ove/jobs';
import type { Job } from '@ove/contracts';

describe('HMAC Webhooks & Notifications', () => {
  const secret = 'super-secret-webhook-signing-key';
  const sampleJob: Job = {
    id: 'r-test-123',
    kind: 'render',
    status: 'done',
    startedAt: 1730000000000,
    endedAt: 1730000005000,
    messages: ['Rendered 90/90 frames'],
    result: { output: 'out.mp4', frames: 90, seconds: 3 },
  };

  it('calculates consistent HMAC-SHA256 signatures for payloads', () => {
    const payloadStr = JSON.stringify({ hello: 'world' });
    const sig1 = signWebhookPayload(payloadStr, secret);
    const sig2 = signWebhookPayload(payloadStr, secret);

    expect(sig1).toBe(sig2);
    expect(sig1).toHaveLength(64); // hex sha256
  });

  it('creates structured job webhook payloads with delivery UUID and ISO timestamp', () => {
    const payload = createJobWebhookPayload(sampleJob);

    expect(payload.event).toBe('job.completed');
    expect(payload.job.id).toBe('r-test-123');
    expect(payload.job.status).toBe('done');
    expect(payload.deliveryId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(new Date(payload.timestamp).getTime()).not.toBeNaN();
  });

  it('dispatches webhook with HMAC signature header and metadata', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedBody = '';

    const mockFetch = vi.fn().mockImplementation((url, init) => {
      capturedUrl = String(url);
      capturedHeaders = init?.headers || {};
      capturedBody = init?.body;
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
      });
    });

    vi.stubGlobal('fetch', mockFetch);

    try {
      const payload = createJobWebhookPayload(sampleJob);
      const res = await dispatchWebhook({
        url: 'https://example.com/api/webhooks/motionrender',
        secret,
        payload,
      });

      expect(res.success).toBe(true);
      expect(res.attempts).toBe(1);
      expect(capturedUrl).toBe('https://example.com/api/webhooks/motionrender');
      expect(capturedHeaders['content-type']).toBe('application/json');
      expect(capturedHeaders['x-motionrender-event']).toBe('job.completed');
      expect(capturedHeaders['x-motionrender-signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
      expect(JSON.parse(capturedBody).job.id).toBe('r-test-123');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('retries on 5xx errors with backoff', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 2) {
        return Promise.resolve({ ok: false, status: 503, statusText: 'Service Unavailable' });
      }
      return Promise.resolve({ ok: true, status: 200, statusText: 'OK' });
    });

    vi.stubGlobal('fetch', mockFetch);

    try {
      const payload = createJobWebhookPayload(sampleJob);
      const res = await dispatchWebhook({
        url: 'https://flaky-server.com/webhook',
        payload,
        maxRetries: 3,
      });

      expect(res.success).toBe(true);
      expect(res.attempts).toBe(2);
      expect(callCount).toBe(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('triggers webhook dispatching automatically when InProcessQueue finishes a job with webhookUrl', async () => {
    let dispatched = false;
    let dispatchedEvent = '';

    const mockFetch = vi.fn().mockImplementation((_url, init) => {
      dispatched = true;
      dispatchedEvent = init?.headers?.['x-motionrender-event'];
      return Promise.resolve({ ok: true, status: 200 });
    });

    vi.stubGlobal('fetch', mockFetch);

    try {
      const queue = new InProcessQueue(async () => ({ success: true }));
      await queue.enqueue({
        kind: 'render',
        input: {
          webhookUrl: 'https://my-app.com/webhooks/render-done',
          webhookSecret: 'secret123',
        },
        who: { userId: 'u1', tenantId: 't1' },
      });

      // Wait a tick for async pump
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(dispatched).toBe(true);
      expect(dispatchedEvent).toBe('job.completed');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

