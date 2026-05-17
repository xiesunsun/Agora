import type { ServerResponse } from "node:http";
import type { EventEnvelope } from "./types.js";

interface SseClient {
  id: string;
  sessionId: string;
  response: ServerResponse;
}

const clients = new Set<SseClient>();
let counter = 0;

export function openSseStream(
  sessionId: string,
  response: ServerResponse,
  onClose: () => void,
): SseClient {
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "access-control-allow-origin": "*",
  });
  response.write("\n");

  const client: SseClient = { id: `c-${++counter}`, sessionId, response };
  clients.add(client);
  response.on("close", () => {
    clients.delete(client);
    onClose();
  });
  return client;
}

export function sendToClient(client: SseClient, type: string, payload: unknown): void {
  const envelope: EventEnvelope = {
    eventId: `evt-${++counter}`,
    type,
    sessionId: client.sessionId,
    occurredAt: new Date().toISOString(),
    payload,
  };
  client.response.write(`data: ${JSON.stringify(envelope)}\n\n`);
}

export function broadcast(sessionId: string, type: string, payload: unknown): void {
  console.log(`  ↓ event  [${sessionId}] ${type}`);
  for (const client of clients) {
    if (client.sessionId === sessionId) sendToClient(client, type, payload);
  }
}
