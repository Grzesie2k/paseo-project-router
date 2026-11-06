import { describe, expect, it } from "vitest";
import { cleanSettings, emptyFallback, emptyRoute, toggleProvider, validateIssues, validateSettings } from "../shared/form.js";
import type { Choices } from "../shared/rpc.js";
import { settingsSchema } from "../shared/settings.js";

const choices: Choices = {
  profiles: [{ id: "p1", name: "P1", provider: "a" }],
  providers: [
    { id: "a", label: "A", metadataSupported: true, models: [] },
    { id: "b", label: "B", metadataSupported: false, models: [] },
  ],
};
const base = () => settingsSchema.parse({});

describe("validateSettings", () => {
  it("accepts empty settings", () => {
    expect(validateSettings(base(), choices)).toEqual([]);
  });

  it("reports an empty route", () => {
    const errors = validateSettings({ ...base(), routes: [emptyRoute()] }, choices);
    expect(errors).toEqual(
      expect.arrayContaining(["Route 1: name is required", "Route 1: choose a profile", "Route 1: add at least one path"]),
    );
  });

  it("reports unknown profile, unsupported metadata provider and duplicate names", () => {
    const route = { ...emptyRoute(), name: "x", paths: ["~/work/x"], profileId: "nope", metadataProvider: "b" };
    const errors = validateSettings({ ...base(), routes: [route, { ...route, profileId: "p1", metadataProvider: undefined }] }, choices);
    expect(errors).toContain('Route "x": unknown profile "nope"');
    expect(errors).toContain('Route "x": B cannot generate metadata');
    expect(errors).toContain('Route name "x" is used more than once');
  });

  it("validates the fallback and skips catalogue checks without choices", () => {
    expect(validateSettings({ ...base(), fallback: emptyFallback() }, null)).toContain("Fallback: choose a profile");
    const ok = { ...base(), fallback: { ...emptyFallback(), profileId: "whatever" } };
    expect(validateSettings(ok, null)).toEqual([]);
  });
});

describe("cleanSettings", () => {
  it("drops blank paths and empty metadata fields", () => {
    const route = { ...emptyRoute(), name: "x", paths: [" ~/a ", ""], profileId: "p1", metadataProvider: "", metadataModel: "m" };
    const out = cleanSettings({ ...base(), routes: [route] });
    expect(out.routes[0]).toEqual({ name: "x", paths: ["~/a"], profileId: "p1", allowedProviders: [] });
    expect(settingsSchema.safeParse(out).success).toBe(true);
  });
});

describe("toggleProvider", () => {
  it("adds and removes without duplicates", () => {
    expect(toggleProvider(["a"], "b", true)).toEqual(["a", "b"]);
    expect(toggleProvider(["a", "b"], "a", false)).toEqual(["b"]);
    expect(toggleProvider(["a"], "a", true)).toEqual(["a"]);
  });
});

describe("validateIssues", () => {
  it("attaches each problem to its route and field", () => {
    const issues = validateIssues({ ...base(), routes: [emptyRoute()], fallback: emptyFallback() }, choices);
    expect(issues).toContainEqual(expect.objectContaining({ target: 0, field: "name" }));
    expect(issues).toContainEqual(expect.objectContaining({ target: 0, field: "profileId" }));
    expect(issues).toContainEqual(expect.objectContaining({ target: "fallback", field: "profileId" }));
  });

  it("marks every route that reuses a name", () => {
    const route = { name: "a", paths: ["/x"], profileId: "p1", allowedProviders: [] };
    const dupes = validateIssues({ ...base(), routes: [route, { ...route }] }, null).filter((i) => i.field === "name");
    expect(dupes.map((i) => i.target)).toEqual([1]);
  });
});
