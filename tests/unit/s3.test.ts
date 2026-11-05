import { describe, expect, it, vi } from 'vitest';
import { S3Client, loadS3ConfigFromEnv, type S3Config } from '@ove/storage';

describe('S3 / Cloudflare R2 / MinIO Storage Client', () => {
  const baseConfig: S3Config = {
    bucket: 'motionrender-videos',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
  };

  it('validates required configuration fields', () => {
    expect(() => new S3Client({} as any)).toThrow(/requires a bucket/);
    expect(() => new S3Client({ bucket: 'b' } as any)).toThrow(/requires accessKeyId/);
    expect(() => new S3Client({ bucket: 'b', accessKeyId: 'k' } as any)).toThrow(/requires secretAccessKey/);
  });

  it('formats virtual-hosted S3 URLs by default for AWS', () => {
    const client = new S3Client(baseConfig);
    const { host, path, fullUrl } = client.getUrl('renders/2026/promo.mp4');

    expect(host).toBe('motionrender-videos.s3.us-east-1.amazonaws.com');
    expect(path).toBe('/renders/2026/promo.mp4');
    expect(fullUrl).toBe('https://motionrender-videos.s3.us-east-1.amazonaws.com/renders/2026/promo.mp4');
  });

  it('formats path-style URLs for localhost / MinIO and custom configurations', () => {
    const client = new S3Client({
      ...baseConfig,
      endpoint: 'http://localhost:9000',
      forcePathStyle: true,
    });
    const { host, path, fullUrl } = client.getUrl('assets/audio.mp3');

    expect(host).toBe('localhost:9000');
    expect(path).toBe('/motionrender-videos/assets/audio.mp3');
    expect(fullUrl).toBe('http://localhost:9000/motionrender-videos/assets/audio.mp3');
  });

  it('generates AWS SigV4 presigned download URLs with correct query parameters', () => {
    const client = new S3Client(baseConfig);
    const presigned = client.getSignedDownloadUrl('renders/final.mp4', 3600);

    expect(presigned).toContain('https://motionrender-videos.s3.us-east-1.amazonaws.com/renders/final.mp4?');
    expect(presigned).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
    expect(presigned).toContain(`X-Amz-Credential=${encodeURIComponent('AKIAIOSFODNN7EXAMPLE')}`);
    expect(presigned).toContain('X-Amz-Expires=3600');
    expect(presigned).toContain('X-Amz-SignedHeaders=host');
    expect(presigned).toContain('X-Amz-Signature=');
  });

  it('loads S3 configuration from environment variables', () => {
    const env: NodeJS.ProcessEnv = {
      S3_BUCKET: 'prod-bucket',
      S3_ACCESS_KEY_ID: 'prod-key',
      S3_SECRET_ACCESS_KEY: 'prod-secret',
      S3_ENDPOINT: 'https://r2.cloudflarestorage.com',
      S3_REGION: 'auto',
      S3_PUBLIC_URL: 'https://cdn.example.com',
    };

    const config = loadS3ConfigFromEnv(env);
    expect(config).toBeDefined();
    expect(config?.bucket).toBe('prod-bucket');
    expect(config?.accessKeyId).toBe('prod-key');
    expect(config?.endpoint).toBe('https://r2.cloudflarestorage.com');
    expect(config?.region).toBe('auto');
    expect(config?.publicUrl).toBe('https://cdn.example.com');
  });

  it('returns undefined when environment variables are missing', () => {
    expect(loadS3ConfigFromEnv({})).toBeUndefined();
  });

  it('uploads object with SigV4 headers using putObject', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: any = null;

    const mockFetch = vi.fn().mockImplementation((url, init) => {
      capturedUrl = String(url);
      capturedHeaders = init?.headers || {};
      capturedBody = init?.body;
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ etag: '"abcd1234etag"' }),
        text: () => Promise.resolve(''),
      });
    });

    vi.stubGlobal('fetch', mockFetch);

    try {
      const client = new S3Client({
        ...baseConfig,
        publicUrl: 'https://cdn.motionrender.io',
      });

      const buffer = Buffer.from('mock video bytes');
      const result = await client.putObject('exports/test.mp4', buffer, 'video/mp4', {
        jobId: 'r-12345',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(capturedUrl).toBe('https://motionrender-videos.s3.us-east-1.amazonaws.com/exports/test.mp4');
      expect(capturedHeaders['content-type']).toBe('video/mp4');
      expect(capturedHeaders['x-amz-meta-jobid']).toBe('r-12345');
      expect(capturedHeaders['Authorization']).toContain('AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE');
      expect(result.etag).toBe('abcd1234etag');
      expect(result.publicUrl).toBe('https://cdn.motionrender.io/exports/test.mp4');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

