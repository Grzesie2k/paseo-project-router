import { describe, expect, it } from "vitest";
import { blockMessage, matchPending, noteText, pillLabel, timelineLine, type PendingRoute } from "../shared/describe.js";

const info = { route: "acme", fallback: false, profile: "Acme", provider: "Provider A" };
const entry = (over: Partial<PendingRoute> = {}): PendingRoute => ({ cwd: "/w/acme", provider: "a", at: 1000, info, ...over });
const agent = { cwd: "/w/acme", provider: "a" };

describe("matchPending", () => {
  it("claims a record for the same cwd and provider", () => {
    const hit = entry();
    expect(matchPending([entry({ cwd: "/other" }), hit], agent, 2000)).toBe(hit);
  });

  it("ignores expired records and other providers", () => {
    expect(matchPending([entry()], agent, 1000 + 61_000)).toBeNull();
    expect(matchPending([entry({ provider: "b" })], agent, 2000)).toBeNull();
  });

  it("prefers the newest record", () => {
    const newer = entry({ at: 1500 });
    expect(matchPending([entry(), newer], agent, 2000)).toBe(newer);
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
