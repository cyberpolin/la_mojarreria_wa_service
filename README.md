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
INBOUND_CONTACTS_STORE_FILE=./data/inbound-contacts.json
CONVERSATION_STORE_FILE=./data/conversations.json
WEBHOOK_SUBSCRIPTIONS_FILE=./data/webhook-subscriptions.json
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

Browser clients from local dev origins such as `http://localhost:5173` are allowed when `SERVICE_ALLOWED_DOMAINS` includes `localhost`. The service uses the hostname for validation, so the port does not need to be listed separately.

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

The service validates the request with zod, normalizes the phone number, sends the WhatsApp message, and stores the registry in `REGISTRY_STORE_FILE`. Mexican 10-digit numbers are normalized to `521...`; for example, `529931175435` becomes `5219931175435`.

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

The payload includes `id`, `phone`, `name`, `campaignKey`, `status`, and timestamps.

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

### `GET /messages/registrations/:phone/status`

Returns the promo status for one registered phone.

Headers:

```http
x-api-key: SERVICE_API_KEY
x-client-domain: lamojarreria.com
```

```bash
curl "https://api.wa.lamojarreria.com/messages/registrations/529931175435/status" \
  -H "x-api-key: SERVICE_API_KEY" \
  -H "x-client-domain: lamojarreria.com"
```

Response:

```json
{
  "ok": true,
  "phone": "5219931175435",
  "campaignKey": "free_papas_signup",
  "status": "active"
}
```

### `GET /messages/inbound/recent`

Lists the latest phone numbers that wrote to WhatsApp, ordered by last inbound message.

Headers:

```http
x-api-key: SERVICE_API_KEY
x-client-domain: lamojarreria.com
```

```bash
curl "https://api.wa.lamojarreria.com/messages/inbound/recent?limit=50" \
  -H "x-api-key: SERVICE_API_KEY" \
  -H "x-client-domain: lamojarreria.com"
```

`limit` defaults to `50` and cannot exceed `50`.

Response:

```json
{
  "ok": true,
  "total": 1,
  "contacts": [
    {
      "phone": "5219931175435",
      "lastText": "SI",
      "lastMessageId": "...",
      "lastReceivedAt": "2026-05-06T00:05:00.000Z",
      "messageCount": 2
    }
  ]
}
```

### `GET /messages/inbound/recent-active-promos`

Lists the latest inbound WhatsApp numbers crossed with local registrations that have `status: "active"`.

Headers:

```http
x-api-key: SERVICE_API_KEY
x-client-domain: lamojarreria.com
```

```bash
curl "https://api.wa.lamojarreria.com/messages/inbound/recent-active-promos?limit=50" \
  -H "x-api-key: SERVICE_API_KEY" \
  -H "x-client-domain: lamojarreria.com"
```

Response:

```json
{
  "ok": true,
  "total": 1,
  "contacts": [
    {
      "phone": "5219931175435",
      "lastText": "SI",
      "lastMessageId": "...",
      "lastReceivedAt": "2026-05-06T00:05:00.000Z",
      "messageCount": 2,
      "registration": {
        "phone": "5219931175435",
        "name": "Carlos",
        "campaignKey": "free_papas_signup",
        "status": "active",
        "createdAt": "2026-05-06T00:00:00.000Z",
        "updatedAt": "2026-05-06T00:05:00.000Z",
        "activatedAt": "2026-05-06T00:05:00.000Z"
      }
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
  "results": [{ "ok": true, "phone": "529931234567", "messageId": "..." }]
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

## Stage 2: Generic WhatsApp API

The `/v1` routes are CRM-agnostic. They expose WhatsApp operations directly: send messages, inspect conversations, read the latest message, and subscribe external systems to message webhooks. Stage 1 subscription endpoints stay available under `/messages/*`.

All protected `/v1` endpoints use:

```http
x-api-key: SERVICE_API_KEY
x-client-domain: lamojarreria.com
```

### `GET /v1/health`

```bash
curl https://api.wa.lamojarreria.com/v1/health
```

### `GET /v1/whatsapp/status`

```bash
curl https://api.wa.lamojarreria.com/v1/whatsapp/status \
  -H "x-api-key: SERVICE_API_KEY" \
  -H "x-client-domain: lamojarreria.com"
```

### `GET /v1/whatsapp/qr`

```bash
curl https://api.wa.lamojarreria.com/v1/whatsapp/qr \
  -H "x-api-key: SERVICE_API_KEY" \
  -H "x-client-domain: lamojarreria.com"
```

Returns `qr` and `qrImage` as a base64 PNG data URL when pairing is needed.

### `POST /v1/messages/send`

```bash
curl -X POST https://api.wa.lamojarreria.com/v1/messages/send \
  -H "content-type: application/json" \
  -H "x-api-key: SERVICE_API_KEY" \
  -H "x-client-domain: lamojarreria.com" \
  -d '{
    "to": "529931175435",
    "text": "Hola, tu pedido esta listo."
  }'
```

Response:

```json
{
  "ok": true,
  "to": "5219931175435",
  "messageId": "..."
}
```

### `GET /v1/conversations`

Lists recent conversations, ordered by last message.

```bash
curl "https://api.wa.lamojarreria.com/v1/conversations?limit=50" \
  -H "x-api-key: SERVICE_API_KEY" \
  -H "x-client-domain: lamojarreria.com"
```

### `GET /v1/conversations/:phone/messages`

```bash
curl "https://api.wa.lamojarreria.com/v1/conversations/529931175435/messages?limit=50" \
  -H "x-api-key: SERVICE_API_KEY" \
  -H "x-client-domain: lamojarreria.com"
```

### `GET /v1/conversations/:phone/last-message`

```bash
curl "https://api.wa.lamojarreria.com/v1/conversations/529931175435/last-message" \
  -H "x-api-key: SERVICE_API_KEY" \
  -H "x-client-domain: lamojarreria.com"
```

### `GET /v1/webhooks/subscriptions`

```bash
curl https://api.wa.lamojarreria.com/v1/webhooks/subscriptions \
  -H "x-api-key: SERVICE_API_KEY" \
  -H "x-client-domain: lamojarreria.com"
```

### `POST /v1/webhooks/subscriptions`

Subscribes an external service to WhatsApp events.

```bash
curl -X POST https://api.wa.lamojarreria.com/v1/webhooks/subscriptions \
  -H "content-type: application/json" \
  -H "x-api-key: SERVICE_API_KEY" \
  -H "x-client-domain: lamojarreria.com" \
  -d '{
    "url": "https://crm.lamojarreria.com/api/whatsapp/events",
    "events": ["message.received"],
    "secret": "optional-shared-secret"
  }'
```

When a user writes to WhatsApp, active subscribers receive:

```json
{
  "event": "message.received",
  "provider": "baileys",
  "message": {
    "id": "...",
    "phone": "5219931175435",
    "text": "Hola",
    "direction": "inbound",
    "timestamp": "2026-05-07T00:00:00.000Z"
  }
}
```

Webhook headers include `x-wa-service-event: message.received`. If a subscription has `secret`, the request also includes `x-wa-service-secret`.

### `DELETE /v1/webhooks/subscriptions/:id`

```bash
curl -X DELETE https://api.wa.lamojarreria.com/v1/webhooks/subscriptions/SUBSCRIPTION_ID \
  -H "x-api-key: SERVICE_API_KEY" \
  -H "x-client-domain: lamojarreria.com"
```

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

If the phone is not present in the local JSON registry, `campaignKey` is sent as `null`.

Any user reply from a phone that already exists in the JSON registry marks that registry as `active`. Replies from unknown phones still notify the backend webhook, but they do not create local registry records. If `DUMMY_REGISTRY_API_URL` is set, existing registries are also updated there with `status: "active"`.

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
