import { describe, expect, it } from "vitest";
import {
  LEGACY_BINARY,
  PRIMARY_BINARY,
  PRODUCT_NAME,
} from "../publicMetadata.js";

describe("public metadata", () => {
  it("prefers Agora as the public product name", () => {
    expect(PRODUCT_NAME).toBe("Agora");
    expect(PRIMARY_BINARY).toBe("agora");
    expect(LEGACY_BINARY).toBe("blackboard-runtime");
  });
});
