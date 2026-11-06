import { describe, expect, it } from "vitest";
import { buildChoices } from "../server/choices.js";
import { parseConfigView } from "../server/paseo-config.js";

const config = parseConfigView({
  daemon: { agentProfiles: [{ id: "p1", name: "Work", provider: "claude-team", model: "m1" }, { id: "p2", provider: "codex" }] },
  agents: {
    providers: {
      "claude-team": { extends: "claude", label: "Team Claude", additionalModels: [{ id: "extra", label: "Extra" }] },
      opencode: { command: ["oc"] },
      codex: {},
      pi: { enabled: false },
    },
  },
});

describe("buildChoices", () => {
  it("maps profiles with name fallback", () => {
    const { profiles } = buildChoices(config);
    expect(profiles).toEqual([
      { id: "p1", name: "Work", provider: "claude-team", model: "m1" },
      { id: "p2", name: "p2", provider: "codex" },
    ]);
  });

  it("flags metadata support and merges configured and snapshot models", () => {
    const { providers } = buildChoices(config, [
      { provider: "claude-team", models: [{ id: "extra", label: "dup" }, { id: "snap", label: "Snap" }] },
      { provider: "codex", label: "Codex", models: [] },
    ]);
    const byId = Object.fromEntries(providers.map((p) => [p.id, p]));
    expect(byId["claude-team"]).toMatchObject({ label: "Team Claude", metadataSupported: true });
    expect(byId["claude-team"].models).toEqual([
      { id: "extra", label: "dup" },
      { id: "snap", label: "Snap" },
    ]);
    expect(byId.codex.metadataSupported).toBe(false);
    expect(byId.opencode.metadataSupported).toBe(true);
  });

  it("works from config alone", () => {
    expect(buildChoices(config).providers.map((p) => p.id).sort()).toEqual(["claude-team", "codex", "opencode"]);
  });

  it("leaves out disabled providers but keeps built-ins without a config entry", () => {
    const { providers } = buildChoices(config, [
      { provider: "pi", models: [{ id: "x", label: "X" }] },
      { provider: "claude", models: [] },
      { provider: "opencode", models: [] },
    ]);
    expect(providers.map((p) => p.id).sort()).toEqual(["claude", "claude-team", "codex", "opencode"]);
  });

  it("falls back to the snapshot when no provider is configured", () => {
    const bare = parseConfigView({});
    expect(buildChoices(bare, [{ provider: "claude", models: [] }]).providers.map((p) => p.id)).toEqual(["claude"]);
  });
});
