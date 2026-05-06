import { Router, type Request, type Response } from "express";
import type { Logger } from "pino";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { rememberCampaign } from "../services/campaignStore.js";
import { savePendingToDummyRegistry } from "../services/dummyRegistryApi.js";
import { getRegistryRecord, listRegistryRecords, upsertPendingRegistry } from "../services/registryStore.js";
import { normalizePhone } from "../utils/phone.js";
import { validateServiceRequest } from "../utils/requestAuth.js";
import type { WhatsAppClient } from "../baileys/client.js";

const subscriptionMessageSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(10).max(20),
  campaignKey: z.string().trim().min(1).max(120)
});

const broadcastMessageSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  status: z.enum(["pending", "active", "all"]).default("active")
});

export function createMessagesRouter(params: {
  config: AppConfig;
  logger: Logger;
  whatsAppClient: WhatsAppClient;
}): Router {
  const router = Router();

  router.post("/subscription", async (req: Request, res: Response) => {
    const authResult = validateServiceRequest(req, params.config);
    if (!authResult.ok) {
      res.status(authResult.status).json({ ok: false, error: authResult.error });
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
      const existingRegistry = await getRegistryRecord(params.config.registryStoreFile, phone);
      if (existingRegistry) {
        const messageId = await params.whatsAppClient.sendAlreadyRegisteredMessage({ phone });

        res.json({
          ok: true,
          phone,
          campaignKey: existingRegistry.campaignKey,
          messageId,
          alreadyRegistered: true
        });
        return;
      }

      const messageId = await params.whatsAppClient.sendSubscriptionMessage({
        name: parsed.data.name,
        phone
      });

      rememberCampaign(phone, parsed.data.campaignKey);
      const registryRecord = await upsertPendingRegistry({
        filePath: params.config.registryStoreFile,
        phone,
        name: parsed.data.name,
        campaignKey: parsed.data.campaignKey,
        sentMessageId: messageId
      });
      await savePendingToDummyRegistry({
        baseUrl: params.config.dummyRegistryApiUrl,
        logger: params.logger,
        record: registryRecord
      });

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

  router.post("/broadcast", async (req: Request, res: Response) => {
    const authResult = validateServiceRequest(req, params.config);
    if (!authResult.ok) {
      res.status(authResult.status).json({ ok: false, error: authResult.error });
      return;
    }

    const parsed = broadcastMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: "Invalid request body",
        issues: parsed.error.flatten().fieldErrors
      });
      return;
    }

    try {
      const records = await listRegistryRecords(params.config.registryStoreFile);
      const targetRecords = records.filter((record) => parsed.data.status === "all" || record.status === parsed.data.status);
      const results = [];

      for (const record of targetRecords) {
        try {
          const messageId = await params.whatsAppClient.sendTextMessage({
            phone: record.phone,
            text: parsed.data.text
          });
          results.push({ ok: true, phone: record.phone, messageId });
        } catch (error) {
          params.logger.warn({ err: error, phone: record.phone }, "failed to send broadcast WhatsApp message");
          results.push({ ok: false, phone: record.phone, error: "Failed to send WhatsApp message" });
        }
      }

      const sent = results.filter((result) => result.ok).length;
      const failed = results.length - sent;

      res.json({
        ok: failed === 0,
        total: results.length,
        sent,
        failed,
        results
      });
    } catch (error) {
      params.logger.error({ err: error }, "failed to send broadcast WhatsApp messages");
      res.status(502).json({ ok: false, error: "Failed to send broadcast" });
    }
  });

  return router;
}
