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
REGISTRY_STORE_FILE=./data/registrations.json
DUMMY_REGISTRY_API_URL=
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
pnpm --filter @mojarreria/wa-service reset:whatsapp -- --yes
```

`reset:whatsapp` deletes `WHATSAPP_AUTH_DIR` so the next service start generates a fresh QR pairing. Stop or restart PM2 around it:

```bash
pm2 stop mojarreria-wa-service
pnpm reset:whatsapp -- --yes
pm2 restart mojarreria-wa-service
```

## Endpoints

### `GET /health`

```bash
curl https://api.wa.lamojarreria.com/health
```

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

```bash
curl -X POST https://api.wa.lamojarreria.com/messages/subscription \
  -H "content-type: application/json" \
  -H "x-api-key: SERVICE_API_KEY" \
  -H "x-client-domain: lamojarreria.com" \
  -d '{
    "name": "Carlos",
    "phone": "529931234567",
    "campaignKey": "free_papas_signup",
    "status": "pending"
  }'
```

Body:

```json
{
  "name": "Carlos",
  "phone": "529931234567",
  "campaignKey": "free_papas_signup",
  "status": "pending"
}
```

`status` is optional and defaults to `pending`. To create the registry as active immediately, send `active`, `activated`, `activo`, or `activado`.

Response:

```json
{
  "ok": true,
  "phone": "529931234567",
  "campaignKey": "free_papas_signup",
  "messageId": "...",
  "status": "pending"
}
```

The service validates the request with zod, normalizes the phone number to digits only, sends the WhatsApp message, and stores the registry in `REGISTRY_STORE_FILE`.

If the phone already exists in the JSON registry, the service sends this WhatsApp message instead of creating a new pending registry:

```text
Este número ya está registrado. Si aún no has pedido tus papas gratis, solo haz un pedido. Si ya las usaste, estate pendiente, pronto te enviaremos promociones.
```

Duplicate response:

```json
{
  "ok": true,
  "phone": "529931234567",
  "campaignKey": "free_papas_signup",
  "messageId": "...",
  "alreadyRegistered": true
}
```

If `DUMMY_REGISTRY_API_URL` is set, the service also sends a best-effort `PUT` to:

```text
DUMMY_REGISTRY_API_URL + "/registrations/:phone"
```

The payload includes `id`, `phone`, `name`, `campaignKey`, `status`, message ids, reply text, and timestamps.

### `GET /messages/registrations`

Lists registered phones from the local JSON registry.

Headers:

```http
x-api-key: SERVICE_API_KEY
x-client-domain: lamojarreria.com
```

```bash
curl "https://api.wa.lamojarreria.com/messages/registrations?status=all" \
  -H "x-api-key: SERVICE_API_KEY" \
  -H "x-client-domain: lamojarreria.com"
```

`status` defaults to `all`. Use `pending`, `active`, or `all`.

Response:

```json
{
  "ok": true,
  "total": 1,
  "registrations": [
    {
      "phone": "529931234567",
      "name": "Carlos",
      "campaignKey": "free_papas_signup",
      "status": "active",
      "createdAt": "2026-05-06T00:00:00.000Z",
      "updatedAt": "2026-05-06T00:05:00.000Z",
      "activatedAt": "2026-05-06T00:05:00.000Z"
    }
  ]
}
```

### `POST /messages/broadcast`

Sends one WhatsApp message to every registered user in the local JSON registry.

Headers:

```http
x-api-key: SERVICE_API_KEY
x-client-domain: lamojarreria.com
```

Body:

```json
{
  "text": "Hoy tenemos promocion de papas gratis en tu pedido.",
  "status": "active"
}
```

`status` defaults to `active`. Use `pending`, `active`, or `all`.

```bash
curl -X POST https://api.wa.lamojarreria.com/messages/broadcast \
  -H "content-type: application/json" \
  -H "x-api-key: SERVICE_API_KEY" \
  -H "x-client-domain: lamojarreria.com" \
  -d '{
    "text": "Hoy tenemos promocion de papas gratis en tu pedido.",
    "status": "active"
  }'
```

Response:

```json
{
  "ok": true,
  "total": 2,
  "sent": 2,
  "failed": 0,
  "results": [
    { "ok": true, "phone": "529931234567", "messageId": "..." }
  ]
}
```

### `GET /whatsapp/status`

Headers:

```http
x-api-key: SERVICE_API_KEY
x-client-domain: lamojarreria.com
```

```bash
curl https://api.wa.lamojarreria.com/whatsapp/status \
  -H "x-api-key: SERVICE_API_KEY" \
  -H "x-client-domain: lamojarreria.com"
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

```bash
curl https://api.wa.lamojarreria.com/whatsapp/qr \
  -H "x-api-key: SERVICE_API_KEY" \
  -H "x-client-domain: lamojarreria.com"
```

Returns the latest Baileys pairing QR string and a base64 PNG data URL when WhatsApp needs to be linked:

```json
{
  "ok": true,
  "qr": "...",
  "qrImage": "data:image/png;base64,...",
  "connected": false,
  "connection": "connecting",
  "hasQr": true
}
```

Render `qrImage` directly in an `<img>` tag. The QR grants access to link the WhatsApp session, so this endpoint is protected by the same API key and domain checks as message sending.

For one-off admin pairing in a browser, GET-only WhatsApp endpoints also accept query params:

```text
https://api.wa.lamojarreria.com/whatsapp/qr?apiKey=SERVICE_API_KEY&clientDomain=lamojarreria.com
```

Prefer headers from application code. Query params can be captured by browser history and server logs.

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

Any user reply marks the JSON registry as `active`. If `DUMMY_REGISTRY_API_URL` is set, the same registry is also updated there with `status: "active"`.

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
