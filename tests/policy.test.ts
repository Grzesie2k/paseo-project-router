import { describe, expect, it } from "vitest";
import { decide, enforceProvider } from "../server/policy.js";
import type { Profile } from "../server/paseo-config.js";
import { settingsSchema } from "../shared/settings.js";

const profile: Profile = {
  id: "acme-profile",
  provider: "provider-a",
  model: "model-a",
  modeId: "mode-a",
  thinkingOptionId: "high",
  featureValues: { fast: true },
};

const route = settingsSchema.parse({
  routes: [{ name: "acme", paths: ["~/work/acme"], profileId: "acme-profile" }],
}).routes[0]!;

const base = {
  provider: "provider-b",
  cwd: "/tmp/x",
  model: "model-b",
  modeId: "mode-b",
  thinkingOptionId: "low",
  featureValues: { other: 1 },
};

describe("enforceProvider", () => {
  it("replaces a foreign provider with the profile values", () => {
    expect(enforceProvider(base, route, profile)).toEqual({
      provider: "provider-a",
      cwd: "/tmp/x",
      model: "model-a",
      modeId: "mode-a",
      thinkingOptionId: "high",
      featureValues: { fast: true },
    });
  });

  it("drops stale settings the profile does not define", () => {
    const sparse: Profile = { id: "p", provider: "provider-a" };
    const result = enforceProvider(base, route, sparse);
    expect(result).toEqual({ provider: "provider-a", cwd: "/tmp/x" });
  });

  it("keeps the config when the provider is the profile's own", () => {
    expect(enforceProvider({ ...base, provider: "provider-a" }, route, profile)).toBeNull();
  });

  it("keeps the config when the provider is in allowedProviders", () => {
    const allowing = { ...route, allowedProviders: ["provider-a", "provider-b"] };
    expect(enforceProvider(base, allowing, profile)).toBeNull();
  });

  it("defaults enforcement to off", () => {
    expect(settingsSchema.parse({}).enforcement).toBe("off");
  });
});

describe("decide", () => {
  it("allows an allowed provider in either mode", () => {
    expect(decide("provider", { ...base, provider: "provider-a" }, route, profile)).toEqual({ action: "allow" });
    expect(decide("block", { ...base, provider: "provider-a" }, route, profile)).toEqual({ action: "allow" });
  });

  it("switches in provider mode and blocks without touching the config in block mode", () => {
    expect(decide("provider", base, route, profile)).toMatchObject({ action: "switch", config: { provider: "provider-a" } });
    expect(decide("block", base, route, profile)).toEqual({ action: "block" });
  });
});

describe("enforcement setting", () => {
  it("accepts block", () => {
    expect(settingsSchema.parse({ enforcement: "block" }).enforcement).toBe("block");
  });
});
