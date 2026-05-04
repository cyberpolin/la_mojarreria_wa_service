import { Router, type Request, type Response } from "express";
import type { Logger } from "pino";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { rememberCampaign } from "../services/campaignStore.js";
import { normalizePhone } from "../utils/phone.js";
import type { WhatsAppClient } from "../baileys/client.js";

const subscriptionMessageSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(10).max(20),
  campaignKey: z.string().trim().min(1).max(120)
});

function isValidApiKey(req: Request, config: AppConfig): boolean {
  const apiKey = req.header("x-api-key");
  return apiKey === config.serviceApiKey;
}

export function createMessagesRouter(params: {
  config: AppConfig;
  logger: Logger;
  whatsAppClient: WhatsAppClient;
}): Router {
  const router = Router();

  router.post("/subscription", async (req: Request, res: Response) => {
    if (!isValidApiKey(req, params.config)) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }

    const parsed = subscriptionMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: "Invalid request body",
        issues: parsed.error.flatten().fieldErrors
      });
      return;
    }

    let phone: string;
    try {
      phone = normalizePhone(parsed.data.phone);
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Invalid phone" });
      return;
    }

    try {
      const messageId = await params.whatsAppClient.sendSubscriptionMessage({
        name: parsed.data.name,
        phone
      });

      rememberCampaign(phone, parsed.data.campaignKey);

      res.json({
        ok: true,
        phone,
        campaignKey: parsed.data.campaignKey,
        messageId
      });
    } catch (error) {
      params.logger.error({ err: error, phone }, "failed to send subscription WhatsApp message");
      res.status(502).json({ ok: false, error: "Failed to send WhatsApp message" });
    }
  });

  return router;
}
