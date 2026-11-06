import { describe, expect, it } from "vitest";
import { blockMessage, matchPending, noteText, prunePending, pillLabel, timelineLine, type PendingRoute } from "../shared/describe.js";

const info = { route: "acme", fallback: false, profile: "Acme", provider: "Provider A" };
const entry = (over: Partial<PendingRoute> = {}): PendingRoute => ({ token: "t1", at: 1000, info, ...over });

describe("matchPending", () => {
  it("claims the record with the same token", () => {
    const hit = entry();
    expect(matchPending([entry({ token: "other" }), hit], "t1", 2000)).toBe(hit);
  });

  it("ignores expired records and other tokens", () => {
    expect(matchPending([entry()], "t1", 1000 + 60_000)).toBeNull();
    expect(matchPending([entry()], "t1", 1000 + 59_999)).not.toBeNull();
    expect(matchPending([entry({ token: "b" })], "t1", 2000)).toBeNull();
  });

  it("prunes records with the same freshness rule", () => {
    expect(prunePending([entry()], 1000 + 60_000)).toEqual([]);
    expect(prunePending([entry()], 1000 + 59_999)).toHaveLength(1);
  });
});

describe("messages", () => {
  it("describes a route and a switch", () => {
    expect(noteText(info)).toBe("Route: acme · Provider A");
    expect(noteText({ ...info, switchedFrom: "Provider B" })).toBe("Switched from Provider B → Provider A (route acme)");
    expect(noteText({ ...info, fallback: true })).toBe("Fallback · Provider A");
    expect(pillLabel({ ...info, switchedFrom: "Provider B" })).toBe("Switched → Provider A");
    expect(timelineLine(info)).toBe("Project router: Route: acme · Provider A");
  });

  it("words the block error", () => {
    expect(blockMessage("Provider B", "acme", false, "Acme")).toBe(
      "Provider Provider B is not allowed in this project (route acme). Use profile Acme.",
    );
    expect(blockMessage("B", "x", true, "P")).toContain("(fallback)");
  });
});
