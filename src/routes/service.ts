import { Router, type Request, type Response } from "express";
import type { WhatsAppClient } from "../baileys/client.js";
import type { AppConfig } from "../config.js";
import { validateServiceRequest } from "../utils/requestAuth.js";

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
    console.log("Received request to activate WhatsApp service");
    if (!ensureAuthorized(req, res, params.config)) {
      console.log("Unauthorized request to activate WhatsApp service");
      return;
    }

    try {
      console.log("Starting WhatsApp service...");
      await params.whatsAppClient.start("manual_activate");
      console.log("WhatsApp service started successfully");
      res.json({ ok: true, ...params.whatsAppClient.getStatus() });
    } catch (error) {
      console.error("Error occurred while activating WhatsApp service:", error);
      res.status(500).json({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to activate WhatsApp service",
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
