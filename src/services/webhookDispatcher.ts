import type { Logger } from "pino";
import type { ConversationMessage } from "./conversationStore.js";
import { listWebhookSubscriptions, type WebhookEventName } from "./webhookSubscriptionStore.js";

type WebhookPayload = {
  event: WebhookEventName;
  provider: "baileys";
  message: ConversationMessage;
};

export async function dispatchWebhookEvent(params: {
  filePath: string;
  logger: Logger;
  event: WebhookEventName;
  payload: WebhookPayload;
}): Promise<void> {
  const subscriptions = await listWebhookSubscriptions(params.filePath);
  const targets = subscriptions.filter(
    (subscription) => subscription.active && subscription.events.includes(params.event)
  );

  await Promise.all(
    targets.map(async (subscription) => {
      try {
        const headers: Record<string, string> = {
          "content-type": "application/json",
          "x-wa-service-event": params.event
        };

        if (subscription.secret) {
          headers["x-wa-service-secret"] = subscription.secret;
        }

        const response = await fetch(subscription.url, {
          method: "POST",
          headers,
          body: JSON.stringify(params.payload)
        });

        if (!response.ok) {
          params.logger.warn(
            {
              status: response.status,
              subscriptionId: subscription.id,
              url: subscription.url
            },
            "v1 webhook subscription request failed"
          );
        }
      } catch (error) {
        params.logger.warn(
          {
            err: error,
            subscriptionId: subscription.id,
            url: subscription.url
          },
          "v1 webhook subscription request failed"
        );
      }
    })
  );
}
