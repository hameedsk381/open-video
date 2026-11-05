# Deploying MotionRender on Dokploy

MotionRender can be deployed in a few clicks on [Dokploy](https://dokploy.com/) using Docker Compose and Traefik.

---

## 1. Create a Compose Project in Dokploy

1. In your Dokploy dashboard, create a new project (e.g. `motionrender`).
2. Click **Add Service** $\rightarrow$ **Compose**.
3. Set the source type to **Git**:
   - **Repository URL**: `https://github.com/hameedsk381/open-video.git` (or your repository URL)
   - **Branch**: `main`
   - **Compose Path**: `infrastructure/dokploy/compose.yml`

---

## 2. Set Environment Variables

Navigate to the **Environment** tab of the Compose project and paste the following values (see `.env.example`):

```ini
# Database & Queue Secrets
POSTGRES_PASSWORD=your_secure_postgres_password_here
REDIS_PASSWORD=your_secure_redis_password_here

# Public Domain (Must match the domain set in Dokploy)
PUBLIC_ORIGIN=https://video.yourdomain.com

# AI Provider Configuration
GROQ_API_KEY=your_groq_key_here
# Or FreeLLMAPI:
FREELLMAPI_KEY=your_freellmapi_key_here
FREELLMAPI_BASE_URL=https://ai.hamathopc.in/v1
FREELLMAPI_MODEL=auto

# Optional Scaling & Worker Settings
WORKER_CONCURRENCY=1
AI_CONCURRENCY=1
RENDER_TIMEOUT_SECONDS=900

# Optional Direct S3 / Cloudflare R2 Uploads (Presigned CDN URLs)
S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
S3_BUCKET=your-bucket-name
S3_REGION=auto
S3_ACCESS_KEY_ID=your_access_key
S3_SECRET_ACCESS_KEY=your_secret_key
S3_PUBLIC_URL=https://cdn.yourdomain.com

# Optional HMAC Webhooks
WEBHOOK_URL=https://your-backend.com/api/webhooks/video
WEBHOOK_SECRET=your_webhook_signing_secret
```

---

## 3. Configure the Domain & SSL (Traefik)

1. Go to the **Domains** tab in Dokploy for the Compose service.
2. Click **Create Domain**:
   - **Host**: `video.yourdomain.com`
   - **Service**: `api`
   - **Port**: `3100`
   - **Certificate**: Let's Encrypt (automatic HTTPS)
3. Save and verify DNS points to your server IP.

---

## 4. Deploy

1. Click **Deploy**.
2. Dokploy will:
   - Build the container images (`ove-api` and `ove-worker`) from the root `Dockerfile`.
   - Start hardened `postgres:16-alpine` and `redis:7-alpine` containers with healthchecks.
   - Launch the `api` service connected to Dokploy's Traefik network.
   - Launch `worker-render` (Chromium + FFmpeg) and `worker-ai` (BullMQ queue runners).

---

## 5. Scaling Workers

To scale render workers horizontally in Dokploy:
- In the Compose file or via terminal inside the server:
  ```bash
  docker compose -f infrastructure/dokploy/compose.yml up --scale worker-render=4 -d
  ```
- Workers automatically distribute rendering tasks from BullMQ in parallel.

