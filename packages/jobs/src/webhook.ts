import { createHmac, randomUUID } from 'node:crypto';
import type { Job } from '@ove/contracts';

export type WebhookEvent = 'job.completed' | 'job.failed' | 'job.progress';

export type WebhookPayload = {
  event: WebhookEvent;
  job: {
    id: string;
    kind: string;
    status: Job['status'];
    result?: unknown;
    error?: string;
    startedAt?: number;
    endedAt?: number;
    messages?: string[];
  };
  timestamp: string;
  deliveryId: string;
};

export type WebhookDispatchOptions = {
  url: string;
  secret?: string;
  payload: WebhookPayload;
  maxRetries?: number;
  timeoutMs?: number;
  log?: (msg: string) => void;
};

export type WebhookDispatchResult = {
  success: boolean;
  statusCode?: number;
  attempts: number;
  error?: string;
};

/**
 * Computes an HMAC-SHA256 signature for a stringified payload.
 */
export function signWebhookPayload(payloadString: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadString).digest('hex');
}

/**
 * Dispatches an HMAC-signed webhook event with retries and exponential backoff.
 */
export async function dispatchWebhook(options: WebhookDispatchOptions): Promise<WebhookDispatchResult> {
  const { url, secret, payload, maxRetries = 3, timeoutMs = 8000, log = () => {} } = options;
  const payloadString = JSON.stringify(payload);
  const signature = secret ? signWebhookPayload(payloadString, secret) : undefined;

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-motionrender-event': payload.event,
    'x-motionrender-delivery': payload.deliveryId,
    'x-motionrender-timestamp': payload.timestamp,
    'user-agent': 'MotionRender-Webhook/1.0',
  };

  if (signature) {
    headers['x-motionrender-signature'] = `sha256=${signature}`;
  }

  let attempt = 0;
  let lastError: string | undefined;

  while (attempt < maxRetries) {
    attempt++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      log(`dispatching webhook event ${payload.event} for job ${payload.job.id} (attempt ${attempt}/${maxRetries}) to ${url}`);
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: payloadString,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.ok) {
        log(`webhook delivered successfully to ${url} (HTTP ${res.status})`);
        return { success: true, statusCode: res.status, attempts: attempt };
      }

      lastError = `HTTP ${res.status} ${res.statusText}`;
      log(`webhook returned non-2xx status: ${lastError}`);

      // If client error (4xx other than 429), don't retry
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        break;
      }
    } catch (err: any) {
      clearTimeout(timer);
      lastError = err?.message || 'Network error';
      log(`webhook dispatch error: ${lastError}`);
    }

    if (attempt < maxRetries) {
      // Exponential backoff: 500ms, 1000ms...
      const delay = Math.min(2000, 500 * Math.pow(2, attempt - 1));
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return { success: false, attempts: attempt, error: lastError };
}

/**
 * Creates a standard webhook payload for a given Job and event.
 */
export function createJobWebhookPayload(job: Job, event?: WebhookEvent): WebhookPayload {
  const effectiveEvent: WebhookEvent = event ?? (job.status === 'done' ? 'job.completed' : job.status === 'error' ? 'job.failed' : 'job.progress');
  return {
    event: effectiveEvent,
    job: {
      id: job.id,
      kind: job.kind,
      status: job.status,
      result: job.result,
      error: job.error,
      startedAt: job.startedAt,
      endedAt: job.endedAt,
      messages: job.messages,
    },
    timestamp: new Date().toISOString(),
    deliveryId: randomUUID(),
  };
}

