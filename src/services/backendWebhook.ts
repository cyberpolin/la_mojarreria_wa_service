import type { AppConfig } from "../config.js";
import type { Logger } from "pino";

export type SubscriptionReplyWebhookPayload = {
  phone: string;
  text: string;
  messageId: string;
  timestamp: string;
  source: "baileys";
  campaignKey: string | null;
};

export type PromotionUsedWebhookPayload = {
  phone: string;
  campaignKey: string | null;
  timestamp: string;
  source: "wa-service";
};

export type WaServiceStatusWebhookPayload = {
  service: "wa-service";
  instanceId: string;
  active: boolean;
  connected: boolean;
  connection: "connecting" | "open" | "close";
  hasQr: boolean;
  state: "INACTIVE" | "STARTING" | "ACTIVE" | "STOPPING" | "ERROR";
  reason: string;
  changedAt: string;
};

export async function notifySubscriptionReply(
  config: AppConfig,
  logger: Logger,
  payload: SubscriptionReplyWebhookPayload,
): Promise<void> {
  console.log(
    "Disable so far to avoid errors until the main backend endpoint is ready",
  );
  return;
  const url = `${config.mainBackendUrl}/webhooks/whatsapp/subscription-reply`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webhook-secret": config.mainBackendWebhookSecret,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    logger.error(
      {
        status: response.status,
        statusText: response.statusText,
        responseText,
        phone: payload.phone,
        messageId: payload.messageId,
      },
      "main backend webhook rejected WhatsApp reply",
    );
    throw new Error(`Backend webhook failed with status ${response.status}`);
  }
}

export async function notifyPromotionUsed(
  config: AppConfig,
  logger: Logger,
  payload: PromotionUsedWebhookPayload,
): Promise<unknown> {
  const url = `${config.mainBackendUrl}/webhooks/whatsapp/promotion-used`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webhook-secret": config.mainBackendWebhookSecret,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text().catch(() => "");
  let responseBody: unknown = null;
  if (responseText) {
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = responseText;
    }
  }

  if (!response.ok) {
    logger.error(
      {
        status: response.status,
        statusText: response.statusText,
        responseBody,
        phone: payload.phone,
      },
      "main backend rejected promotion used webhook",
    );
    throw new Error(
      `Backend promotion used webhook failed with status ${response.status}`,
    );
  }

  return responseBody;
}

export async function notifyWaServiceStatusChanged(
  config: AppConfig,
  logger: Logger,
  payload: WaServiceStatusWebhookPayload,
): Promise<void> {
  const url = `${config.mainBackendUrl}/rest/wa-service/status`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-wa-service-webhook-secret": config.mainBackendWebhookSecret,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    logger.error(
      {
        status: response.status,
        statusText: response.statusText,
        responseText,
        payload,
      },
      "main backend rejected WhatsApp service status webhook",
    );
    throw new Error(
      `Backend WhatsApp service status webhook failed with status ${response.status}`,
    );
  }
}
