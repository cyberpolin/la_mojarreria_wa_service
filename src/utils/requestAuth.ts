import type { Request } from "express";
import type { AppConfig } from "../config.js";

type RequestAuthResult =
  | { ok: true }
  | {
      ok: false;
      status: 401 | 403;
      error: string;
    };

function parseDomainHeader(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).hostname;
  } catch {
    return trimmed.split("/")[0]?.split(":")[0] ?? null;
  }
}

function getRequestDomain(req: Request): string | null {
  const explicitDomain = req.header("x-client-domain");
  if (explicitDomain) {
    return parseDomainHeader(explicitDomain);
  }

  const origin = req.header("origin");
  if (origin) {
    return parseDomainHeader(origin);
  }

  const referer = req.header("referer");
  if (referer) {
    return parseDomainHeader(referer);
  }

  return null;
}

function isAllowedDomain(domain: string, allowedDomains: readonly string[]): boolean {
  return allowedDomains.some((allowedDomain) => domain === allowedDomain || domain.endsWith(`.${allowedDomain}`));
}

export function validateServiceRequest(req: Request, config: AppConfig): RequestAuthResult {
  const apiKey = req.header("x-api-key");
  if (apiKey !== config.serviceApiKey) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const requestDomain = getRequestDomain(req);
  if (!requestDomain || !isAllowedDomain(requestDomain, config.serviceAllowedDomains)) {
    return { ok: false, status: 403, error: "Forbidden domain" };
  }

  return { ok: true };
}
