import { describe, expect, it } from "vitest";
import { notConfigured, ok, requestFailed } from "./types";

describe("ProviderResult helpers", () => {
  it("ok() wraps data with ok:true", () => {
    expect(ok({ x: 1 })).toEqual({ ok: true, data: { x: 1 } });
  });

  it("notConfigured() carries a NOT_CONFIGURED reason and detail", () => {
    expect(notConfigured("no key")).toEqual({
      ok: false,
      reason: "NOT_CONFIGURED",
      detail: "no key",
    });
  });

  it("requestFailed() carries a REQUEST_FAILED reason and detail", () => {
    expect(requestFailed("timed out")).toEqual({
      ok: false,
      reason: "REQUEST_FAILED",
      detail: "timed out",
    });
  });
});
