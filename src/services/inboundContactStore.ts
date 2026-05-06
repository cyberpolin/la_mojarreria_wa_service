import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type InboundContact = {
  phone: string;
  lastText: string;
  lastMessageId: string;
  lastReceivedAt: string;
  messageCount: number;
};

type InboundContactData = {
  contacts: InboundContact[];
};

let writeQueue = Promise.resolve();

function emptyData(): InboundContactData {
  return { contacts: [] };
}

async function readData(filePath: string): Promise<InboundContactData> {
  try {
    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as Partial<InboundContactData>;

    if (!Array.isArray(parsed.contacts)) {
      return emptyData();
    }

    return { contacts: parsed.contacts };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return emptyData();
    }

    throw error;
  }
}

async function writeData(filePath: string, data: InboundContactData): Promise<void> {
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

export async function recordInboundContact(params: {
  filePath: string;
  phone: string;
  text: string;
  messageId: string;
  receivedAt: string;
}): Promise<InboundContact> {
  return enqueueWrite(async () => {
    const data = await readData(params.filePath);
    const existing = data.contacts.find((contact) => contact.phone === params.phone);
    const nextContact: InboundContact = {
      phone: params.phone,
      lastText: params.text,
      lastMessageId: params.messageId,
      lastReceivedAt: params.receivedAt,
      messageCount: (existing?.messageCount ?? 0) + 1
    };

    if (existing) {
      Object.assign(existing, nextContact);
    } else {
      data.contacts.push(nextContact);
    }

    await writeData(params.filePath, data);
    return nextContact;
  });
}

export async function listRecentInboundContacts(filePath: string, limit = 50): Promise<InboundContact[]> {
  const data = await readData(filePath);
  return [...data.contacts]
    .sort((left, right) => right.lastReceivedAt.localeCompare(left.lastReceivedAt))
    .slice(0, limit);
}
