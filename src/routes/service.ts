import { Router, type Request, type Response } from "express";
import type { Logger } from "pino";
import { z } from "zod";
import type { WhatsAppClient } from "../baileys/client.js";
import type { AppConfig } from "../config.js";
import { validateServiceRequest } from "../utils/requestAuth.js";

const statusSchema = z.object({
  active: z.boolean(),
});

function ensureAuthorized(
  req: Request,
  res: Response,
  config: AppConfig,
): boolean {
  const authResult = validateServiceRequest(req, config);
  if (!authResult.ok) {
    res.status(authResult.status).json({ ok: false, error: authResult.error });
    return false;
  }

  return true;
}

export function createServiceRouter(params: {
  config: AppConfig;
  logger: Logger;
  whatsAppClient: WhatsAppClient;
}): Router {
  const router = Router();

  router.get("/status", (req: Request, res: Response) => {
    if (!ensureAuthorized(req, res, params.config)) {
      return;
    }

    res.json({ ok: true, ...params.whatsAppClient.getStatus() });
  });

  router.post("/activate", async (req: Request, res: Response) => {
    params.logger.info("received request to activate WhatsApp service");
    if (!ensureAuthorized(req, res, params.config)) {
      params.logger.warn("unauthorized request to activate WhatsApp service");
      return;
    }

    try {
      params.logger.info("starting WhatsApp service");
      await params.whatsAppClient.start("manual_activate");
      params.logger.info("WhatsApp service started successfully");
      res.json({ ok: true, ...params.whatsAppClient.getStatus() });
    } catch (error) {
      params.logger.error(
        { err: error },
        "error occurred while activating WhatsApp service",
      );
      res.status(500).json({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to activate WhatsApp service",
      });
    }
  });

  router.post("/status", async (req: Request, res: Response) => {
    if (!ensureAuthorized(req, res, params.config)) {
      return;
    }

    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: "Invalid status payload",
        details: parsed.error.flatten(),
      });
      return;
    }

    try {
      if (parsed.data.active) {
        params.logger.info("setting WhatsApp service status to active");
        await params.whatsAppClient.start("set_status_active");
      } else {
        params.logger.info("setting WhatsApp service status to inactive");
        await params.whatsAppClient.stop("set_status_inactive");
      }

      res.json({ ok: true, ...params.whatsAppClient.getStatus() });
    } catch (error) {
      params.logger.error(
        { err: error, active: parsed.data.active },
        "failed to set WhatsApp service status",
      );
      res.status(500).json({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to set WhatsApp service status",
      });
    }
  });

  router.post("/deactivate", async (req: Request, res: Response) => {
    if (!ensureAuthorized(req, res, params.config)) {
      return;
    }

    try {
      await params.whatsAppClient.stop("manual_deactivate");
      res.json({ ok: true, ...params.whatsAppClient.getStatus() });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to deactivate WhatsApp service",
      });
    }
  });

  return router;
}
