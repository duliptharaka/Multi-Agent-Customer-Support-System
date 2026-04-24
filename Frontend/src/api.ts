import type { AdkEvent } from "./types";

const API_BASE = import.meta.env.VITE_ADK_API_BASE_URL ?? "/api/adk";
const APP_NAME = import.meta.env.VITE_ADK_APP_NAME ?? "customer_support";

export interface SessionHandle {
  appName: string;
  userId: string;
  sessionId: string;
}

export async function createSession(userId: string): Promise<SessionHandle> {
  const sessionId = crypto.randomUUID();
  const url = `${API_BASE}/apps/${APP_NAME}/users/${encodeURIComponent(userId)}/sessions/${sessionId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(`createSession failed: ${res.status} ${await res.text()}`);
  }
  return { appName: APP_NAME, userId, sessionId };
}

export interface RunArgs {
  session: SessionHandle;
  message: string;
  signal?: AbortSignal;
  onEvent: (event: AdkEvent) => void;
}

export async function runSse({ session, message, signal, onEvent }: RunArgs): Promise<void> {
  const res = await fetch(`${API_BASE}/run_sse`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    signal,
    body: JSON.stringify({
      app_name: session.appName,
      user_id: session.userId,
      session_id: session.sessionId,
      new_message: { role: "user", parts: [{ text: message }] },
      streaming: false,
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`run_sse failed: ${res.status} ${await res.text().catch(() => "")}`);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;

    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const data = chunk
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (!data || data === "[DONE]") continue;
      try {
        onEvent(JSON.parse(data) as AdkEvent);
      } catch {
        // Non-JSON keepalive or partial frame; ignore.
      }
    }
  }
}
