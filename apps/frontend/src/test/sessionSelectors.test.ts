import { describe, expect, it } from "vitest";
import { activeSnapshot } from "../fixtures/active";
import {
  hasBlockingProceedBullets,
  selectActiveBullets,
  selectActiveReviewChangeSet,
  selectBulletVisualStatus,
  selectDocumentUnits,
  selectPageStatus,
  selectRevisionLabel,
} from "../app/sessionSelectors";

describe("session selectors", () => {
  it("sorts document units and bullets from the snapshot", () => {
    expect(selectDocumentUnits(activeSnapshot)[0]?.unitId).toBe("u-title");
    expect(selectActiveBullets(activeSnapshot)[0]?.bulletId).toBe("b-1");
  });

  it("exposes revision and review state used by the page", () => {
    expect(selectRevisionLabel(activeSnapshot)).toBe("三稿");
    expect(selectActiveReviewChangeSet(activeSnapshot)).toBeNull();
  });

  it("maps backend lifecycle status into the three rail visual states", () => {
    const bullets = selectActiveBullets(activeSnapshot);

    expect(selectBulletVisualStatus(bullets[0]!)).toBe("processing");
    expect(selectBulletVisualStatus(bullets[1]!)).toBe("new");
    expect(selectBulletVisualStatus(bullets[2]!)).toBe("processed");
  });

  it("derives page status from backend status and frontend view state", () => {
    expect(selectPageStatus(activeSnapshot, "workspace", "flow")).toBe(
      "active",
    );
    expect(selectPageStatus(activeSnapshot, "history_preview", "flow")).toBe(
      "history_preview",
    );
    expect(
      selectPageStatus(
        { ...activeSnapshot, sessionStatus: "reviewing" },
        "workspace",
        "pr",
      ),
    ).toBe("reviewing_pr");
  });

  it("blocks proceed only when there are no bullets at all", () => {
    // Has bullets → not blocking
    expect(hasBlockingProceedBullets(activeSnapshot)).toBe(false);

    // No bullets → blocking
    expect(
      hasBlockingProceedBullets({
        ...activeSnapshot,
        activeBullets: [],
      }),
    ).toBe(true);
  });
});
