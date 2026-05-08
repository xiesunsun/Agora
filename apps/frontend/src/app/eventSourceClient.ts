import type { EventEnvelope } from "../types/blackboard";

export function subscribeToSessionEvents(
  sessionId: string,
  onEvent: (event: EventEnvelope) => void,
  onError: () => void,
): () => void {
  const source = new EventSource(`/api/sessions/${sessionId}/events`);

  source.onmessage = (message) => {
    onEvent(JSON.parse(message.data) as EventEnvelope);
  };

  source.onerror = () => {
    onError();
  };

  return () => source.close();
}
