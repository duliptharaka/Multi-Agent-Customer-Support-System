export type Role = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: Role;
  author?: string;
  text: string;
}

export interface AgentTrace {
  id: string;
  kind: "transfer" | "tool_call" | "tool_result" | "error";
  label: string;
  detail?: string;
}

export interface AdkPart {
  text?: string;
  function_call?: { name: string; args?: Record<string, unknown> };
  function_response?: { name: string; response?: unknown };
}

export interface AdkEvent {
  author?: string;
  content?: { role?: string; parts?: AdkPart[] };
  actions?: { transfer_to_agent?: string };
  error_code?: string;
  error_message?: string;
}
