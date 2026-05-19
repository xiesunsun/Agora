import { beforeEach, describe, expect, test, vi } from "vitest";

describe("sessionStore real-session filtering", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("demo does not count as an open collaboration session", async () => {
    const {
      createSession,
      getOrCreateDemoSession,
      hasOpenSessions,
      listOpenSessions,
    } = await import("../sessionStore.js");

    getOrCreateDemoSession();
    expect(hasOpenSessions()).toBe(true);
    expect(hasOpenSessions({ includeDemo: false })).toBe(false);
    expect(listOpenSessions({ includeDemo: false })).toEqual([]);

    createSession(`real-session-${Date.now()}`, "Test", "# Test\n\nContent.");
    expect(hasOpenSessions({ includeDemo: false })).toBe(true);
    expect(listOpenSessions({ includeDemo: false })).toHaveLength(1);
  });
});
