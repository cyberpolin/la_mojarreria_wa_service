import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type WebhookEventName = "message.received";

export type WebhookSubscription = {
  id: string;
  url: string;
  events: WebhookEventName[];
  secret: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type WebhookSubscriptionData = {
  subscriptions: WebhookSubscription[];
};

let writeQueue = Promise.resolve();

function emptyData(): WebhookSubscriptionData {
  return { subscriptions: [] };
}

async function readData(filePath: string): Promise<WebhookSubscriptionData> {
  try {
    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as Partial<WebhookSubscriptionData>;

    if (!Array.isArray(parsed.subscriptions)) {
      return emptyData();
    }

    return { subscriptions: parsed.subscriptions };
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
  data: WebhookSubscriptionData,
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

export async function listWebhookSubscriptions(
  filePath: string,
): Promise<WebhookSubscription[]> {
  const data = await readData(filePath);
  return data.subscriptions;
}

export async function createWebhookSubscription(params: {
  filePath: string;
  url: string;
  events: WebhookEventName[];
  secret: string | null;
}): Promise<WebhookSubscription> {
  return enqueueWrite(async () => {
    const now = new Date().toISOString();
    const data = await readData(params.filePath);
    const subscription: WebhookSubscription = {
      id: randomUUID(),
      url: params.url,
      events: params.events,
      secret: params.secret,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    data.subscriptions.push(subscription);
    await writeData(params.filePath, data);
    return subscription;
  });
}

export async function deleteWebhookSubscription(
  filePath: string,
  id: string,
): Promise<boolean> {
  return enqueueWrite(async () => {
    const data = await readData(filePath);
    const before = data.subscriptions.length;
    data.subscriptions = data.subscriptions.filter(
      (subscription) => subscription.id !== id,
    );

    if (data.subscriptions.length === before) {
      return false;
    }

    await writeData(filePath, data);
    return true;
  });
}
