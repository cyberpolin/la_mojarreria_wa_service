import type { Logger } from "pino";
import type { RegistryRecord } from "./registryStore.js";

async function sendDummyRegistryRequest(params: {
  baseUrl: string | null;
  logger: Logger;
  method: "POST" | "PUT";
  path: string;
  record: RegistryRecord;
}): Promise<void> {
  if (!params.baseUrl) {
    return;
  }

  const url = `${params.baseUrl}${params.path}`;
  try {
    const response = await fetch(url, {
      method: params.method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: params.record.phone, ...params.record })
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      params.logger.warn(
        {
          status: response.status,
          responseText,
          phone: params.record.phone
        },
        "dummy registry API request failed"
      );
    }
  } catch (error) {
    params.logger.warn(
      {
        err: error,
        phone: params.record.phone,
        url
      },
      "dummy registry API request failed"
    );
  }
}

export async function savePendingToDummyRegistry(params: {
  baseUrl: string | null;
  logger: Logger;
  record: RegistryRecord;
}): Promise<void> {
  await sendDummyRegistryRequest({
    baseUrl: params.baseUrl,
    logger: params.logger,
    method: "PUT",
    path: `/registrations/${encodeURIComponent(params.record.phone)}`,
    record: params.record
  });
}

export async function activateDummyRegistry(params: {
  baseUrl: string | null;
  logger: Logger;
  record: RegistryRecord;
}): Promise<void> {
  await sendDummyRegistryRequest({
    baseUrl: params.baseUrl,
    logger: params.logger,
    method: "PUT",
    path: `/registrations/${encodeURIComponent(params.record.phone)}`,
    record: params.record
  });
}
