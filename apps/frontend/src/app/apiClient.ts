import type {
  BlackboardCommandPayload,
  CommandEnvelope,
  CommandResponse,
  HistoryVersionPayload,
} from "../types/blackboard";

const BACKEND_BASE = (import.meta as { env?: Record<string, string> }).env?.VITE_BACKEND_URL ?? "";

export class ApiClient {
  constructor(private readonly sessionId: string) {}

  async sendCommand<TPayload extends BlackboardCommandPayload>(
    type: string,
    payload: TPayload,
  ): Promise<CommandResponse> {
    const command: CommandEnvelope<TPayload> = {
      commandId: crypto.randomUUID(),
      type,
      sessionId: this.sessionId,
      issuedAt: new Date().toISOString(),
      payload,
    };

    const response = await fetch(`${BACKEND_BASE}/api/sessions/${this.sessionId}/commands`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(command),
    });
    const result = (await response.json()) as CommandResponse;

    if (!response.ok || !result.ok) {
      return result;
    }

    return result;
  }

  async getHistoryVersion(versionId: string): Promise<HistoryVersionPayload> {
    const response = await fetch(
      `${BACKEND_BASE}/api/sessions/${this.sessionId}/history/${versionId}`,
    );

    if (!response.ok) {
      throw new Error(`Failed to load history version ${versionId}`);
    }

    return (await response.json()) as HistoryVersionPayload;
  }
}

export type SessionRuntimeMode =
  | { kind: "fixture" }
  | { kind: "demo"; sessionId: "demo" }
  | { kind: "session"; sessionId: string }
  | { kind: "missing" };

export function getSessionRuntimeMode(location: Location): SessionRuntimeMode {
  const searchParams = new URLSearchParams(location.search);
  const transport = searchParams.get("transport");

  if (transport === "fixture") {
    return { kind: "fixture" };
  }

  const sessionId = searchParams.get("sessionId");

  if (sessionId === "demo") {
    return { kind: "demo", sessionId };
  }

  if (sessionId) {
    return { kind: "session", sessionId };
  }

  return { kind: "missing" };
}
