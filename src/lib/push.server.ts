import { buildPushPayload } from "@block65/webcrypto-web-push";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  kind: "message" | "reaction";
  soundUrl: string | null;
};

export type StoredSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/** Envia um push criptografado (VAPID) para um aparelho inscrito. Retorna o status HTTP. */
export async function sendWebPush(sub: StoredSubscription, payload: PushPayload): Promise<number> {
  const vapid = {
    subject: process.env["VAPID_SUBJECT"],
    publicKey: process.env["VAPID_PUBLIC_KEY"],
    privateKey: process.env["VAPID_PRIVATE_KEY"],
  };

  const built = await buildPushPayload(
    { data: payload, options: { ttl: 60 * 60 * 12, urgency: "high" } },
    {
      endpoint: sub.endpoint,
      expirationTime: null,
      keys: { auth: sub.auth, p256dh: sub.p256dh },
    },
    vapid,
  );

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(built.headers)) {
    if (typeof value === "string") headers[key] = value;
  }

  const response = await fetch(sub.endpoint, {
    method: built.method,
    headers,
    body: built.body as unknown as BodyInit,
  });

  return response.status;
}
