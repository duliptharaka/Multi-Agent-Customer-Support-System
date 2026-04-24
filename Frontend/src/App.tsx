import { useEffect, useMemo, useRef, useState } from "react";
import { createSession, runSse, type SessionHandle } from "./api";
import type { AdkEvent, AgentTrace, ChatMessage } from "./types";

const SUGGESTIONS = [
  "Where is order #10? When will it arrive?",
  "I want to return order #7 — speaker battery only lasts 2 hours. Email: grace.chen@example.com",
  "I was charged for order #8 though I cancelled. Email: henry.walker@example.com",
  "What is your return policy?",
];

function newId(): string {
  return crypto.randomUUID();
}

export default function App() {
  const [session, setSession] = useState<SessionHandle | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [traces, setTraces] = useState<AgentTrace[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const userId = useMemo(() => {
    const saved = localStorage.getItem("cs.user_id");
    if (saved) return saved;
    const fresh = `user-${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem("cs.user_id", fresh);
    return fresh;
  }, []);

  useEffect(() => {
    createSession(userId)
      .then(setSession)
      .catch((e: unknown) => setSessionError(e instanceof Error ? e.message : String(e)));
  }, [userId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, traces, busy]);

  async function send(text: string) {
    if (!session || !text.trim() || busy) return;
    setInput("");

    const userMsg: ChatMessage = { id: newId(), role: "user", text };
    setMessages((m) => [...m, userMsg]);
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;

    let currentAssistantId: string | null = null;

    try {
      await runSse({
        session,
        message: text,
        signal: controller.signal,
        onEvent: (evt: AdkEvent) => {
          const author = evt.author ?? "agent";

          if (evt.actions?.transfer_to_agent) {
            setTraces((t) => [
              ...t,
              {
                id: newId(),
                kind: "transfer",
                label: `${author} → ${evt.actions!.transfer_to_agent}`,
              },
            ]);
          }

          for (const part of evt.content?.parts ?? []) {
            if (part.function_call) {
              setTraces((t) => [
                ...t,
                {
                  id: newId(),
                  kind: "tool_call",
                  label: `${author} · ${part.function_call!.name}`,
                  detail: part.function_call!.args ? JSON.stringify(part.function_call!.args) : undefined,
                },
              ]);
            }
            if (part.function_response) {
              setTraces((t) => [
                ...t,
                {
                  id: newId(),
                  kind: "tool_result",
                  label: `${author} · ${part.function_response!.name}`,
                },
              ]);
            }
            if (part.text && part.text.trim()) {
              const chunk = part.text;
              setMessages((m) => {
                const last = m[m.length - 1];
                if (last && last.role === "assistant" && last.author === author && last.id === currentAssistantId) {
                  return [...m.slice(0, -1), { ...last, text: last.text + chunk }];
                }
                const id = newId();
                currentAssistantId = id;
                return [...m, { id, role: "assistant", author, text: chunk }];
              });
            }
          }

          if (evt.error_message) {
            setTraces((t) => [
              ...t,
              { id: newId(), kind: "error", label: "error", detail: evt.error_message },
            ]);
          }
        },
      });
    } catch (e: unknown) {
      if ((e as Error).name !== "AbortError") {
        setTraces((t) => [
          ...t,
          { id: newId(), kind: "error", label: "request failed", detail: (e as Error).message },
        ]);
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function reset() {
    abortRef.current?.abort();
    setMessages([]);
    setTraces([]);
    setSession(null);
    setSessionError(null);
    try {
      setSession(await createSession(userId));
    } catch (e: unknown) {
      setSessionError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="app">
      <header className="bar">
        <div className="title">Customer Support · Multi-Agent</div>
        <div className="meta">
          <span className="pill">user: {userId}</span>
          <span className={`pill ${session ? "ok" : "warn"}`}>
            {session ? `session ${session.sessionId.slice(0, 8)}` : sessionError ? "no session" : "connecting..."}
          </span>
          <button className="ghost" onClick={reset} disabled={busy}>new session</button>
        </div>
      </header>

      <main className="body">
        <section className="chat" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="hint">
              <div className="hint-title">Try one of these:</div>
              <ul>
                {SUGGESTIONS.map((s) => (
                  <li key={s}>
                    <button className="link" onClick={() => send(s)} disabled={!session || busy}>{s}</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`msg ${m.role}`}>
              <div className="msg-head">{m.role === "user" ? "you" : (m.author ?? "assistant")}</div>
              <div className="msg-body">{m.text}</div>
            </div>
          ))}

          {busy && <div className="msg assistant pending"><div className="msg-body">thinking…</div></div>}
        </section>

        <aside className="trace">
          <div className="trace-head">Agent trace</div>
          {traces.length === 0 && <div className="trace-empty">transfers and tool calls will appear here</div>}
          {traces.map((t) => (
            <div key={t.id} className={`trace-row ${t.kind}`}>
              <span className="trace-kind">{t.kind}</span>
              <span className="trace-label">{t.label}</span>
              {t.detail && <span className="trace-detail">{t.detail}</span>}
            </div>
          ))}
        </aside>
      </main>

      <footer className="composer">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder={session ? "Ask about an order, return, or ticket…" : "Waiting for session…"}
          rows={2}
          disabled={!session}
        />
        {busy ? (
          <button onClick={stop} className="danger">stop</button>
        ) : (
          <button onClick={() => send(input)} disabled={!session || !input.trim()}>send</button>
        )}
      </footer>
    </div>
  );
}
