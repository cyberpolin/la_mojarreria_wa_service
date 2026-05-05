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

function escapeSvgText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function messageSvg(message: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">
  <rect width="320" height="320" fill="#fff"/>
  <text x="160" y="150" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#111">${escapeSvgText(message)}</text>
</svg>`;
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
    res.setHeader("cache-control", "no-store");

    if (!qr) {
      res.status(404).type("image/svg+xml").send(messageSvg("QR not available"));
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
