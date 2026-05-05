import { Router, type Request, type Response } from "express";
import QRCode from "qrcode";
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

  router.get("/qr.svg", async (req: Request, res: Response) => {
    if (!ensureAuthorized(req, res, params.config)) {
      return;
    }

    const qr = params.whatsAppClient.getLatestQr();
    if (!qr) {
      res.status(404).json({
        ok: false,
        error: "QR not available",
        ...params.whatsAppClient.getStatus()
      });
      return;
    }

    const svg = await QRCode.toString(qr, {
      type: "svg",
      margin: 2,
      width: 320,
      errorCorrectionLevel: "M"
    });

    res.type("image/svg+xml").send(svg);
  });

  return router;
}
