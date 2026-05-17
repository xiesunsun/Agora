import { describe, expect, it } from "vitest";
import { getSessionRuntimeMode } from "../app/apiClient";

describe("session runtime mode", () => {
  it("treats fixture transport as fixture mode", () => {
    const location = {
      search: "?transport=fixture",
    } as Location;

    expect(getSessionRuntimeMode(location)).toEqual({ kind: "fixture" });
  });

  it("treats explicit demo as demo mode", () => {
    const location = {
      search: "?sessionId=demo",
    } as Location;

    expect(getSessionRuntimeMode(location)).toEqual({
      kind: "demo",
      sessionId: "demo",
    });
  });

  it("treats explicit non-demo session ids as real session mode", () => {
    const location = {
      search: "?sessionId=session-123",
    } as Location;

    expect(getSessionRuntimeMode(location)).toEqual({
      kind: "session",
      sessionId: "session-123",
    });
  });

  it("does not silently fall back to demo when sessionId is missing", () => {
    const location = {
      search: "",
    } as Location;

    expect(getSessionRuntimeMode(location)).toEqual({ kind: "missing" });
  });
});
