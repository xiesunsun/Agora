import type { EventEnvelope } from "../types/blackboard";

export function subscribeToSessionEvents(
  sessionId: string,
  onEvent: (event: EventEnvelope) => void,
  onError: () => void,
): () => void {
  const base = (import.meta as { env?: Record<string, string> }).env?.VITE_BACKEND_URL ?? "";
  const source = new EventSource(`${base}/api/sessions/${sessionId}/events`);

  source.onmessage = (message) => {
    onEvent(JSON.parse(message.data) as EventEnvelope);
  };

  source.onerror = () => {
    onError();
  };

  return () => source.close();
}
