import { Router, type Request, type Response } from "express";
import QRCode from "qrcode";
import type { AppConfig } from "../config.js";
import type { WhatsAppClient } from "../baileys/client.js";
import { validateServiceRequest } from "../utils/requestAuth.js";

function ensureAuthorized(req: Request, res: Response, config: AppConfig): boolean {
  const authResult = validateServiceRequest(req, config);
  if (!authResult.ok && !isAuthorizedByQuery(req, config)) {
    res.status(authResult.status).json({ ok: false, error: authResult.error });
    return false;
  }

  return true;
}

function getQueryValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseDomain(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  try {
    return new URL(normalized).hostname;
  } catch {
    return normalized.split("/")[0]?.split(":")[0] ?? null;
  }
}

function isAllowedDomain(domain: string, allowedDomains: readonly string[]): boolean {
  return allowedDomains.some((allowedDomain) => domain === allowedDomain || domain.endsWith(`.${allowedDomain}`));
}

function isAuthorizedByQuery(req: Request, config: AppConfig): boolean {
  if (req.method !== "GET") {
    return false;
  }

  const apiKey = getQueryValue(req.query.apiKey);
  const clientDomain = getQueryValue(req.query.clientDomain);
  const parsedDomain = clientDomain ? parseDomain(clientDomain) : null;

  return apiKey === config.serviceApiKey && parsedDomain !== null && isAllowedDomain(parsedDomain, config.serviceAllowedDomains);
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

  router.get("/qr", async (req: Request, res: Response) => {
    if (!ensureAuthorized(req, res, params.config)) {
      return;
    }

    const qr = params.whatsAppClient.getLatestQr();
    const qrImage = qr
      ? await QRCode.toDataURL(qr, {
          margin: 2,
          width: 320,
          errorCorrectionLevel: "M"
        })
      : null;

    res.json({
      ok: true,
      qr,
      qrImage,
      ...params.whatsAppClient.getStatus()
    });
  });

  router.get("/qr.svg", (req: Request, res: Response) => {
    if (!ensureAuthorized(req, res, params.config)) {
      return;
    }

    res.status(410).json({
      ok: false,
      error: "Use /whatsapp/qr for base64 QR data"
    });
  });

  return router;
}
