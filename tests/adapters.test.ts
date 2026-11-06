import { describe, expect, it } from "vitest";
import { buildInvocation, isSupportedForMetadata, resolveAdapter } from "../server/adapters.js";

const providers = {
  claude: { env: { CONFIG: "/a" } },
  "claude-team": { extends: "claude", env: { CONFIG: "/b" } },
  opencode: { command: ["my-oc"] },
  codex: {},
};

describe("adapters", () => {
  it("resolves claude and extending providers with their env", () => {
    expect(resolveAdapter("claude", providers)).toEqual({ kind: "claude", command: "claude", prefixArgs: [], env: { CONFIG: "/a" } });
    expect(resolveAdapter("claude-team", providers)?.env).toEqual({ CONFIG: "/b" });
  });

  it("uses the configured opencode command", () => {
    const adapter = resolveAdapter("opencode", providers)!;
    expect(buildInvocation(adapter, "vendor/model", "hi")).toMatchObject({
      command: "my-oc",
      args: ["run", "-m", "vendor/model"],
      stdin: "hi",
    });
  });

  it("keeps the arguments of a multi-word command", () => {
    const adapter = resolveAdapter("claude", { claude: { command: ["docker", "run", "-i", "img", "claude"] } })!;
    expect(buildInvocation(adapter, undefined, "hi")).toMatchObject({
      command: "docker",
      args: ["run", "-i", "img", "claude", "-p"],
    });
  });

  it("builds a claude invocation", () => {
    const adapter = resolveAdapter("claude", providers)!;
    expect(buildInvocation(adapter, "some-model", "hi").args).toEqual(["-p", "--model", "some-model"]);
  });

  it("marks other providers unsupported", () => {
    expect(isSupportedForMetadata("codex", providers)).toBe(false);
    expect(isSupportedForMetadata("unknown", providers)).toBe(false);
  });
});
