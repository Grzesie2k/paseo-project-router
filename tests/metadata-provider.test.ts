import { describe, expect, it } from "vitest";
import { generateMetadataText } from "../server/metadata-provider.js";
import { settingsSchema } from "../shared/settings.js";

const settings = settingsSchema.parse({
  routes: [
    {
      name: "scratch",
      paths: ["/nonexistent-router-test"],
      profileId: "p",
      metadataProvider: "claude",
      metadataModel: "m1",
    },
  ],
});

const config = async () => ({ profiles: [], providers: { claude: { env: { K: "v" } }, codex: {} } });

describe("generateMetadataText", () => {
  it("runs the route's metadata provider and model", async () => {
    let seen: unknown;
    const text = await generateMetadataText(
      "/nonexistent-router-test/app",
      "prompt",
      {
        getSettings: async () => settings,
        readConfig: config,
        run: async (invocation) => ((seen = invocation), "result"),
      },
    );
    expect(text).toBe("result");
    expect(seen).toMatchObject({ args: ["-p", "--model", "m1"], env: { K: "v" }, stdin: "prompt" });
  });

  it("fails without a route or fallback", async () => {
    await expect(
      generateMetadataText("/elsewhere", "p", { getSettings: async () => settings, readConfig: config }),
    ).rejects.toThrow(/No route/);
  });

  it("fails for an unsupported provider", async () => {
    const s = settingsSchema.parse({ fallback: { profileId: "p", metadataProvider: "codex" } });
    await expect(
      generateMetadataText("/elsewhere", "p", { getSettings: async () => s, readConfig: config }),
    ).rejects.toThrow(/not supported/);
  });
});
