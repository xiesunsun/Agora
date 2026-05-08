import { describe, expect, it } from "vitest";
import { activeSnapshot } from "../fixtures/active";
import { reduceSessionEvent } from "../app/eventReducer";
import type { EventEnvelope } from "../types/blackboard";

function event(type: string, payload: unknown): EventEnvelope {
  return {
    eventId: `evt-${type}`,
    type,
    sessionId: activeSnapshot.sessionId,
    occurredAt: "2026-05-07T12:00:00.000Z",
    payload,
  };
}

describe("event reducer", () => {
  it("replaces local state from a snapshot event", () => {
    const next = {
      ...activeSnapshot,
      workingSetRevision: activeSnapshot.workingSetRevision + 1,
    };

    expect(
      reduceSessionEvent(activeSnapshot, event("session.snapshot", next))
        .workingSetRevision,
    ).toBe(4);
  });

  it("tracks proceeding progress from protocol events", () => {
    const proceeding = reduceSessionEvent(
      activeSnapshot,
      event("proceed.started", {
        stage: "resolving_bullets",
        completed: 0,
        total: 3,
        progress: 0,
      }),
    );
    const progressed = reduceSessionEvent(
      proceeding,
      event("proceed.progress_updated", { completed: 2, total: 3 }),
    );

    expect(progressed.sessionStatus).toBe("proceeding");
    expect(progressed.proceeding?.completed).toBe(2);
    expect(progressed.proceeding?.progress).toBe(67);
  });

  it("creates review state when proceed materializes a change set", () => {
    const proceeding = {
      ...activeSnapshot,
      sessionStatus: "proceeding" as const,
      proceeding: {
        stage: "materializing_review" as const,
        completed: 3,
        total: 3,
        progress: 100,
      },
    };
    const reviewed = reduceSessionEvent(
      proceeding,
      event("review_change_set.created", {
        changeSetId: "changeset-test",
        mode: "flow",
        status: "ready",
        changes: [],
      }),
    );

    expect(reviewed.sessionStatus).toBe("reviewing");
    expect(reviewed.activeReviewChangeSet?.changeSetId).toBe("changeset-test");
    expect(reviewed.proceeding).toBeNull();
  });
});
