/**
 * HTTP client for the backend CLI endpoints.
 * The adapter uses this to read the dispatch queue and update event status.
 */

import type { DispatchEvent, SessionSnapshot } from "./types.js";

interface HealthResponse {
  ok: boolean;
  backendUrl: string;
  frontendUrl: string;
  frontendReachable: boolean;
}

export class BackendHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class BackendClient {
  constructor(readonly baseUrl: string) {}

  async getHealth(): Promise<HealthResponse> {
    return this.get("/cli/health");
  }

  async createSession(title: string, initialContent: string): Promise<{ sessionId: string; frontendUrl: string }> {
    return this.post("/cli/sessions", { title, initialContent });
  }

  async setThread(sessionId: string, subagentThreadId: string): Promise<void> {
    await this.post(`/cli/sessions/${sessionId}/thread`, { subagentThreadId });
  }

  async getSnapshot(sessionId: string): Promise<SessionSnapshot> {
    return this.get(`/cli/sessions/${sessionId}/snapshot`);
  }

  async getPendingEvents(sessionId: string): Promise<DispatchEvent[]> {
    const result = await this.get<{ events: DispatchEvent[] }>(
      `/cli/sessions/${sessionId}/dispatch-events?status=pending`,
    );
    return result.events;
  }

  async claimEvent(sessionId: string, eventId: string): Promise<boolean> {
    try {
      await this.post(`/cli/sessions/${sessionId}/dispatch-events/${eventId}/claim`, {});
      return true;
    } catch (error) {
      if (error instanceof BackendHttpError && error.status === 409) {
        return false;
      }
      throw error;
    }
  }

  async completeEvent(sessionId: string, eventId: string): Promise<void> {
    await this.post(`/cli/sessions/${sessionId}/dispatch-events/${eventId}/complete`, {});
  }

  async failEvent(sessionId: string, eventId: string, reason: string): Promise<void> {
    await this.post(`/cli/sessions/${sessionId}/dispatch-events/${eventId}/fail`, { reason });
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) {
      throw new BackendHttpError(res.status, `GET ${path} → ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new BackendHttpError(res.status, `POST ${path} → ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }
}
