import type {
  BlackboardCommandPayload,
  CommandEnvelope,
  CommandResponse,
  HistoryVersionPayload,
} from "../types/blackboard";

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

    const response = await fetch(`/api/sessions/${this.sessionId}/commands`, {
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
      `/api/sessions/${this.sessionId}/history/${versionId}`,
    );

    if (!response.ok) {
      throw new Error(`Failed to load history version ${versionId}`);
    }

    return (await response.json()) as HistoryVersionPayload;
  }
}

export function getSessionIdFromLocation(location: Location): string {
  return new URLSearchParams(location.search).get("sessionId") ?? "demo";
}
