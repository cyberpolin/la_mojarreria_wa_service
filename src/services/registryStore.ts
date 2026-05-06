import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type RegistryStatus = "pending" | "active";

export type RegistryRecord = {
  phone: string;
  name: string | null;
  campaignKey: string | null;
  status: RegistryStatus;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
};

type RegistryData = {
  registrations: RegistryRecord[];
};

let writeQueue = Promise.resolve();

function emptyData(): RegistryData {
  return { registrations: [] };
}

async function readData(filePath: string): Promise<RegistryData> {
  try {
    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as Partial<RegistryData>;

    if (!Array.isArray(parsed.registrations)) {
      return emptyData();
    }

    return { registrations: parsed.registrations };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return emptyData();
    }

    throw error;
  }
}

async function writeData(filePath: string, data: RegistryData): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(operation, operation);
  writeQueue = next.then(
    () => undefined,
    () => undefined
  );

  return next;
}

export async function upsertPendingRegistry(params: {
  filePath: string;
  phone: string;
  name: string;
  campaignKey: string;
  status?: RegistryStatus;
}): Promise<RegistryRecord> {
  return enqueueWrite(async () => {
    const now = new Date().toISOString();
    const data = await readData(params.filePath);
    const existing = data.registrations.find((record) => record.phone === params.phone);
    const status = params.status ?? existing?.status ?? "pending";

    const nextRecord: RegistryRecord = {
      phone: params.phone,
      name: params.name,
      campaignKey: params.campaignKey,
      status,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      activatedAt: status === "active" ? (existing?.activatedAt ?? now) : (existing?.activatedAt ?? null)
    };

    if (existing) {
      Object.assign(existing, nextRecord);
    } else {
      data.registrations.push(nextRecord);
    }

    await writeData(params.filePath, data);
    return nextRecord;
  });
}

export async function getRegistryRecord(filePath: string, phone: string): Promise<RegistryRecord | null> {
  const data = await readData(filePath);
  return data.registrations.find((record) => record.phone === phone) ?? null;
}

export async function listRegistryRecords(filePath: string): Promise<RegistryRecord[]> {
  const data = await readData(filePath);
  return data.registrations;
}

export async function activateRegistry(params: {
  filePath: string;
  phone: string;
  campaignKey: string | null;
}): Promise<RegistryRecord | null> {
  return enqueueWrite(async () => {
    const now = new Date().toISOString();
    const data = await readData(params.filePath);
    const existing = data.registrations.find((record) => record.phone === params.phone);

    if (!existing) {
      return null;
    }

    const nextRecord: RegistryRecord = {
      phone: params.phone,
      name: existing.name,
      campaignKey: existing.campaignKey ?? params.campaignKey,
      status: "active",
      createdAt: existing.createdAt,
      updatedAt: now,
      activatedAt: now
    };

    Object.assign(existing, nextRecord);
    await writeData(params.filePath, data);
    return nextRecord;
  });
}
