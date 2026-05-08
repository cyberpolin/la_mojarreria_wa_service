import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type ConversationMessageDirection = "inbound" | "outbound";

export type ConversationMessage = {
  id: string;
  phone: string;
  text: string;
  direction: ConversationMessageDirection;
  timestamp: string;
};

export type Conversation = {
  phone: string;
  lastMessage: ConversationMessage;
  messageCount: number;
  updatedAt: string;
};

type ConversationData = {
  messages: ConversationMessage[];
};

let writeQueue = Promise.resolve();

function emptyData(): ConversationData {
  return { messages: [] };
}

async function readData(filePath: string): Promise<ConversationData> {
  try {
    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as Partial<ConversationData>;

    if (!Array.isArray(parsed.messages)) {
      return emptyData();
    }

    return { messages: parsed.messages };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return emptyData();
    }

    throw error;
  }
}

async function writeData(
  filePath: string,
  data: ConversationData,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(operation, operation);
  writeQueue = next.then(
    () => undefined,
    () => undefined,
  );

  return next;
}

export async function recordConversationMessage(params: {
  filePath: string;
  phone: string;
  text: string;
  messageId: string;
  direction: ConversationMessageDirection;
  timestamp: string;
}): Promise<ConversationMessage> {
  return enqueueWrite(async () => {
    const data = await readData(params.filePath);
    const message: ConversationMessage = {
      id: params.messageId,
      phone: params.phone,
      text: params.text,
      direction: params.direction,
      timestamp: params.timestamp,
    };

    data.messages.push(message);
    await writeData(params.filePath, data);
    return message;
  });
}

export async function listConversations(
  filePath: string,
  limit = 50,
): Promise<Conversation[]> {
  const data = await readData(filePath);
  const byPhone = new Map<string, Conversation>();

  for (const message of data.messages) {
    const current = byPhone.get(message.phone);
    if (!current) {
      byPhone.set(message.phone, {
        phone: message.phone,
        lastMessage: message,
        messageCount: 1,
        updatedAt: message.timestamp,
      });
      continue;
    }

    current.messageCount += 1;
    if (message.timestamp > current.lastMessage.timestamp) {
      current.lastMessage = message;
      current.updatedAt = message.timestamp;
    }
  }

  return [...byPhone.values()]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit);
}

export async function listConversationMessages(params: {
  filePath: string;
  phone: string;
  limit?: number;
}): Promise<ConversationMessage[]> {
  const data = await readData(params.filePath);
  return data.messages
    .filter((message) => message.phone === params.phone)
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, params.limit ?? 50);
}

export async function getLastConversationMessage(params: {
  filePath: string;
  phone: string;
}): Promise<ConversationMessage | null> {
  const [lastMessage] = await listConversationMessages({
    filePath: params.filePath,
    phone: params.phone,
    limit: 1,
  });

  return lastMessage ?? null;
}
