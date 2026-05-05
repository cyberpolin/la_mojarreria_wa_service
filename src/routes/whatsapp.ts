import { Router, type Request, type Response } from "express";
import type { AppConfig } from "../config.js";
import type { WhatsAppClient } from "../baileys/client.js";
import { validateServiceRequest } from "../utils/requestAuth.js";

function ensureAuthorized(req: Request, res: Response, config: AppConfig): boolean {
  const authResult = validateServiceRequest(req, config);
  if (!authResult.ok) {
    res.status(authResult.status).json({ ok: false, error: authResult.error });
    return false;
  }

  return true;
}

export function createWhatsAppRouter(params: {
  config: AppConfig;
  whatsAppClient: WhatsAppClient;
}): Router {
  const router = Router();

  router.get("/status", (req: Request, res: Response) => {
    if (!ensureAuthorized(req, res, params.config)) {
      return;
    }

    res.json({
      ok: true,
      ...params.whatsAppClient.getStatus()
    });
  });

  router.get("/qr", (req: Request, res: Response) => {
    if (!ensureAuthorized(req, res, params.config)) {
      return;
    }

    res.json({
      ok: true,
      qr: params.whatsAppClient.getLatestQr(),
      ...params.whatsAppClient.getStatus()
    });
  });

  return router;
}
