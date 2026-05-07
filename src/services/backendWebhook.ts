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

export async function notifySubscriptionReply(
  config: AppConfig,
  logger: Logger,
  payload: SubscriptionReplyWebhookPayload
): Promise<void> {
  console.log('Disable so far to avoid errors until the main backend endpoint is ready');
  return;
  const url = `${config.mainBackendUrl}/webhooks/whatsapp/subscription-reply`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webhook-secret": config.mainBackendWebhookSecret
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    logger.error(
      {
        status: response.status,
        statusText: response.statusText,
        responseText,
        phone: payload.phone,
        messageId: payload.messageId
      },
      "main backend webhook rejected WhatsApp reply"
    );
    throw new Error(`Backend webhook failed with status ${response.status}`);
  }
}
