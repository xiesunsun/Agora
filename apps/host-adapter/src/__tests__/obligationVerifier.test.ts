import { describe, expect, test, vi } from "vitest";
import { verifyObligation } from "../obligationVerifier.js";

describe("verifyObligation", () => {
  test("treats edit bullets as satisfied without requiring mark_bullet_ready", async () => {
    const result = await verifyObligation(
      {
        eventId: "event-1",
        sessionId: "session-1",
        eventType: "bullet.created",
        message: [
          "用户在 session session-1 直接编辑了正文：",
          "- bulletId: b-edit-1-u1",
          "- unitId: u1",
          "- beforeText: old",
          "- afterText: new",
          "",
          "请理解这个编辑事实，更新本地 sessionDocument.md。",
        ].join("\n"),
        occurredAt: new Date().toISOString(),
        status: "pending",
      },
      {
        getSnapshot: vi.fn().mockResolvedValue({
          sessionId: "session-1",
          sessionStatus: "active",
          activeBullets: [
            { bulletId: "b-edit-1-u1", type: "edit", status: "new" },
          ],
        }),
      } as never,
    );

    expect(result).toEqual({ satisfied: true });
  });

  test("requires comment bullets to become ready or applied", async () => {
    const result = await verifyObligation(
      {
        eventId: "event-1",
        sessionId: "session-1",
        eventType: "bullet.created",
        message: [
          "用户在 session session-1 创建了一条 comment bullet：",
          "- bulletId: b-comment-1-u1",
          "- unitId: u1",
          "- anchorText: effort",
          "- content: please expand",
          "",
          "请处理这条 bullet，完成后调用 mark_bullet_ready。",
        ].join("\n"),
        occurredAt: new Date().toISOString(),
        status: "pending",
      },
      {
        getSnapshot: vi.fn().mockResolvedValue({
          sessionId: "session-1",
          sessionStatus: "active",
          activeBullets: [
            { bulletId: "b-comment-1-u1", type: "comment", status: "processing" },
          ],
        }),
      } as never,
    );

    expect(result.satisfied).toBe(false);
    expect(result.reason).toContain("expected \"ready\"");
  });
});
