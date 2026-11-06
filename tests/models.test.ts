import { describe, expect, it } from "vitest";
import { customCandidate, describeModel, filterModels } from "../shared/models.js";

const models = [
  { id: "claude-haiku-5-5", label: "Haiku 5.5" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5" },
  { id: "acme/fast", label: "Fast" },
];

describe("filterModels", () => {
  it("returns everything for a blank query", () => {
    expect(filterModels(models, "  ")).toHaveLength(3);
  });

  it("matches id or label fragments case-insensitively", () => {
    expect(filterModels(models, "HAIKU").map((m) => m.id)).toEqual(["claude-haiku-5-5"]);
    expect(filterModels(models, "5.5").map((m) => m.id)).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5"]);
    expect(filterModels(models, "acme/").map((m) => m.id)).toEqual(["acme/fast"]);
    expect(filterModels(models, "zzz")).toEqual([]);
  });
});

describe("describeModel", () => {
  it("shows the label of a catalog model", () => {
    expect(describeModel(models, "acme/fast")).toEqual({ text: "Fast", inCatalog: true });
  });

  it("keeps a saved value that is not in the catalog", () => {
    expect(describeModel(models, "haiku")).toEqual({ text: "haiku", inCatalog: false });
  });

  it("treats no value as the provider default", () => {
    expect(describeModel(models, undefined)).toEqual({ text: "", inCatalog: true });
  });
});

describe("customCandidate", () => {
  it("offers typed text unless it is an existing id", () => {
    expect(customCandidate(models, " my-model ")).toBe("my-model");
    expect(customCandidate(models, "acme/fast")).toBeNull();
    expect(customCandidate(models, "")).toBeNull();
  });
});
