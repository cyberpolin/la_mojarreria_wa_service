# La Mojarreria WhatsApp Adapter

Small standalone WhatsApp adapter service for onboarding and subscription replies.

This service is intentionally separate from the main La Mojarreria backend. It runs as a long-lived process on a VPS, sends WhatsApp subscription messages through Baileys, and forwards user replies to the main backend webhook. It does not decide whether a user is subscribed or verified.

## Stack

- Node.js
- TypeScript
- Express
- Baileys
- dotenv
- zod
- pino

No database is used for the MVP. Baileys auth/session files are stored locally in `./auth` by default.

## Setup

```bash
pnpm install
cp apps/wa-service/.env.example apps/wa-service/.env
```

Edit `apps/wa-service/.env`:

```dotenv
PORT=3001
SERVICE_API_KEY=replace-with-a-long-random-api-key
SERVICE_ALLOWED_DOMAINS=lamojarreria.com,localhost,127.0.0.1
MAIN_BACKEND_URL=https://api.lamojarreria.example
MAIN_BACKEND_WEBHOOK_SECRET=replace-with-a-long-random-webhook-secret
WHATSAPP_AUTH_DIR=./auth
```

Start the service:

```bash
pnpm --filter @mojarreria/wa-service dev
```

On first run, scan the QR code printed in the terminal with WhatsApp. Auth files will be persisted in `WHATSAPP_AUTH_DIR`.

## Scripts

```bash
pnpm --filter @mojarreria/wa-service dev
pnpm --filter @mojarreria/wa-service build
pnpm --filter @mojarreria/wa-service start
pnpm --filter @mojarreria/wa-service typecheck
```

## Endpoints

### `GET /health`

Returns:

```json
{ "ok": true }
```

### `POST /messages/subscription`

Headers:

```http
x-api-key: SERVICE_API_KEY
x-client-domain: lamojarreria.com
```

The trusted domain can also come from `Origin` or `Referer`, but server-to-server callers should send `x-client-domain` explicitly. Use `x-client-domain: localhost` for local client testing.

Body:

```json
{
  "name": "Carlos",
  "phone": "529931234567",
  "campaignKey": "free_papas_signup"
}
```

Response:

```json
{
  "ok": true,
  "phone": "529931234567",
  "campaignKey": "free_papas_signup",
  "messageId": "..."
}
```

The service validates the request with zod, normalizes the phone number to digits only, sends the WhatsApp message, and stores `phone -> campaignKey` in memory.

### `GET /whatsapp/status`

Headers:

```http
x-api-key: SERVICE_API_KEY
x-client-domain: lamojarreria.com
```

Returns:

```json
{
  "ok": true,
  "connected": false,
  "connection": "connecting",
  "hasQr": true
}
```

### `GET /whatsapp/qr`

Headers:

```http
x-api-key: SERVICE_API_KEY
x-client-domain: lamojarreria.com
```

Returns the latest Baileys pairing QR string when WhatsApp needs to be linked:

```json
{
  "ok": true,
  "qr": "...",
  "connected": false,
  "connection": "connecting",
  "hasQr": true
}
```

The QR grants access to link the WhatsApp session, so this endpoint is protected by the same API key and domain checks as message sending.

### `GET /whatsapp/qr.svg`

Headers:

```http
x-api-key: SERVICE_API_KEY
x-client-domain: lamojarreria.com
```

Returns the latest Baileys pairing QR rendered as an SVG image. Open this URL in a browser with the required headers through a client tool, or proxy it from an internal admin screen.

## Reply Webhook

When the user replies, this service calls:

```text
MAIN_BACKEND_URL + "/webhooks/whatsapp/subscription-reply"
```

Headers:

```http
content-type: application/json
x-webhook-secret: MAIN_BACKEND_WEBHOOK_SECRET
```

Payload:

```json
{
  "phone": "529931234567",
  "text": "SI",
  "messageId": "...",
  "timestamp": "2026-05-04T15:00:00.000Z",
  "source": "baileys",
  "campaignKey": "free_papas_signup"
}
```

If the phone is not present in the in-memory campaign map, `campaignKey` is sent as `null`.

## VPS Deployment With pm2

Install dependencies and build on the VPS:

```bash
pnpm install --prod=false
pnpm --filter @mojarreria/wa-service build
```

Start with pm2 from the repo root:

```bash
pm2 startOrReload apps/wa-service/ecosystem.config.cjs --env production
pm2 save
pm2 startup
```

Operational notes:

- Keep `apps/wa-service/.env` on the VPS and never commit it.
- Back up `apps/wa-service/auth` if the VPS is replaced.
- Use a process manager such as pm2 so the service restarts after crashes or server reboots.
- Point the main backend to `POST http://your-vps:3001/messages/subscription`.
- Restrict firewall access to trusted backend IPs when possible.

## GitHub Actions Deployment

This repo includes:

- `.github/workflows/wa-service-ci.yml` for typecheck and build on service changes.
- `.github/workflows/deploy-wa-service-cloudcluster.yml` for manual CloudCluster/VPS deployment over SSH.
- `apps/wa-service/ecosystem.config.cjs` for PM2.

Create a GitHub environment named `cloudcluster`, then add these repository or environment secrets:

```text
CLOUDCLUSTER_HOST=your-server-host-or-ip
CLOUDCLUSTER_USER=deploy
CLOUDCLUSTER_SSH_KEY=private SSH key for the deploy user
CLOUDCLUSTER_SSH_PORT=22
CLOUDCLUSTER_DEPLOY_PATH=/home/deploy/la_mojarreria
WA_SERVICE_ENV_FILE=full contents of apps/wa-service/.env
```

The deploy workflow builds in GitHub Actions, uploads a release bundle to the server, installs dependencies on the server, builds again for the server environment, and starts or reloads PM2.

CloudCluster server prerequisites:

```bash
node --version
corepack --version
npm install -g pm2
```

The deploy user must have SSH access and write permission to `CLOUDCLUSTER_DEPLOY_PATH`. The workflow preserves `apps/wa-service/auth` so the WhatsApp session is not overwritten on deploy.
