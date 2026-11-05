import { createHash, createHmac } from 'node:crypto';

export type S3Config = {
  endpoint?: string;
  bucket: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl?: string;
  forcePathStyle?: boolean;
};

export type S3UploadResult = {
  bucket: string;
  key: string;
  url: string;
  publicUrl?: string;
  etag?: string;
};

function sha256Hex(data: string | Buffer | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

function getSigningKey(secretKey: string, dateStamp: string, region: string, service = 's3'): Buffer {
  const kDate = hmacSha256(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}

function encodeRfc3986(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export class S3Client {
  readonly endpoint: string;
  readonly bucket: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly publicUrl?: string;
  readonly forcePathStyle: boolean;

  constructor(config: S3Config) {
    if (!config.bucket) throw new Error('S3Config requires a bucket');
    if (!config.accessKeyId) throw new Error('S3Config requires accessKeyId');
    if (!config.secretAccessKey) throw new Error('S3Config requires secretAccessKey');

    this.bucket = config.bucket;
    this.region = config.region || 'us-east-1';
    this.accessKeyId = config.accessKeyId;
    this.secretAccessKey = config.secretAccessKey;
    this.publicUrl = config.publicUrl?.replace(/\/+$/, '');

    const rawEndpoint = config.endpoint || `https://s3.${this.region}.amazonaws.com`;
    this.endpoint = rawEndpoint.replace(/\/+$/, '');

    // By default, localhost / 127.0.0.1 (MinIO) uses path style; AWS/R2 can use virtual host style or path style
    this.forcePathStyle = config.forcePathStyle ?? (this.endpoint.includes('localhost') || this.endpoint.includes('127.0.0.1'));
  }

  /**
   * Resolves the full URL for a given object key.
   */
  getUrl(key: string): { host: string; path: string; fullUrl: string } {
    const cleanKey = key.replace(/^\/+/, '');
    const url = new URL(this.endpoint);

    if (this.forcePathStyle) {
      const path = `/${this.bucket}/${cleanKey.split('/').map(encodeRfc3986).join('/')}`;
      return {
        host: url.host,
        path,
        fullUrl: `${url.origin}${path}`,
      };
    } else {
      // Virtual hosted-style: bucket.s3.region.amazonaws.com or bucket.endpoint
      const host = `${this.bucket}.${url.host}`;
      const path = `/${cleanKey.split('/').map(encodeRfc3986).join('/')}`;
      return {
        host,
        path,
        fullUrl: `${url.protocol}//${host}${path}`,
      };
    }
  }

  /**
   * Uploads raw buffer or byte content directly to S3/R2/MinIO via standard SigV4 PUT.
   */
  async putObject(
    key: string,
    data: Buffer | Uint8Array,
    contentType = 'application/octet-stream',
    metadata: Record<string, string> = {}
  ): Promise<S3UploadResult> {
    const { host, path, fullUrl } = this.getUrl(key);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);
    const payloadHash = sha256Hex(data);

    const headers: Record<string, string> = {
      'content-length': String(data.byteLength),
      'content-type': contentType,
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };

    for (const [mKey, mVal] of Object.entries(metadata)) {
      headers[`x-amz-meta-${mKey.toLowerCase()}`] = String(mVal);
    }

    // SigV4 Canonical headers
    const sortedHeaderKeys = Object.keys(headers).sort();
    const canonicalHeaders = sortedHeaderKeys.map(k => `${k}:${headers[k].trim()}\n`).join('');
    const signedHeaders = sortedHeaderKeys.join(';');

    const canonicalRequest = [
      'PUT',
      path,
      '', // No query string
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join('\n');

    const signingKey = getSigningKey(this.secretAccessKey, dateStamp, this.region);
    const signature = hmacSha256(signingKey, stringToSign).toString('hex');
    const authHeader = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await fetch(fullUrl, {
      method: 'PUT',
      headers: {
        ...headers,
        Authorization: authHeader,
      },
      body: data as any,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`S3 PUT failed (${res.status} ${res.statusText}): ${errText}`);
    }

    const etag = res.headers.get('etag')?.replace(/"/g, '') || undefined;
    const cleanKey = key.replace(/^\/+/, '');
    const publicUrl = this.publicUrl ? `${this.publicUrl}/${cleanKey}` : undefined;

    return {
      bucket: this.bucket,
      key: cleanKey,
      url: fullUrl,
      publicUrl,
      etag,
    };
  }

  /**
   * Generates a presigned GET URL valid for `expiresInSeconds` (default 1 hour).
   */
  getSignedDownloadUrl(key: string, expiresInSeconds = 3600): string {
    const { host, path, fullUrl } = this.getUrl(key);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;

    const queryParams: Record<string, string> = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${this.accessKeyId}/${credentialScope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(expiresInSeconds),
      'X-Amz-SignedHeaders': 'host',
    };

    const sortedQuery = Object.keys(queryParams)
      .sort()
      .map(k => `${encodeRfc3986(k)}=${encodeRfc3986(queryParams[k])}`)
      .join('&');

    const canonicalHeaders = `host:${host}\n`;
    const signedHeaders = 'host';
    const payloadHash = 'UNSIGNED-PAYLOAD';

    const canonicalRequest = [
      'GET',
      path,
      sortedQuery,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join('\n');

    const signingKey = getSigningKey(this.secretAccessKey, dateStamp, this.region);
    const signature = hmacSha256(signingKey, stringToSign).toString('hex');

    return `${fullUrl}?${sortedQuery}&X-Amz-Signature=${signature}`;
  }
}

/**
 * Loads S3 configuration from environment variables if set.
 */
export function loadS3ConfigFromEnv(env: NodeJS.ProcessEnv = process.env): S3Config | undefined {
  const bucket = env.S3_BUCKET;
  const accessKeyId = env.S3_ACCESS_KEY_ID || env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY || env.AWS_SECRET_ACCESS_KEY;

  if (!bucket || !accessKeyId || !secretAccessKey) {
    return undefined;
  }

  return {
    bucket,
    accessKeyId,
    secretAccessKey,
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION || env.AWS_REGION || 'us-east-1',
    publicUrl: env.S3_PUBLIC_URL || env.CDN_URL,
    forcePathStyle: env.S3_FORCE_PATH_STYLE ? env.S3_FORCE_PATH_STYLE === 'true' || env.S3_FORCE_PATH_STYLE === '1' : undefined,
  };
}

