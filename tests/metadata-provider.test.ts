import { describe, expect, it } from "vitest";
import { createMetadataConnection, extractJson, generateMetadataText } from "../server/metadata-provider.js";
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

describe("extractJson", () => {
  it("unwraps fences and surrounding prose", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJson('Here you go: {"a":[1,2]} Done.')).toBe('{"a":[1,2]}');
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });

  it("returns non-JSON text unchanged", () => {
    expect(extractJson("just words")).toBe("just words");
  });
});

describe("metadata connection", () => {
  const prompt = (sessionId: string) =>
    ({
      type: "session.prompt",
      requestId: "r",
      sessionId,
      prompt: { clientMessageId: "m1", input: { type: "message", content: [{ type: "text", text: "hi" }] } },
    }) as never;

  it("fails a prompt for an unknown session", async () => {
    const connection = createMetadataConnection({ getSettings: async () => settings });
    const events: { type: string; result?: { type: string } }[] = [];
    connection.onEvent((event) => events.push(event as never));
    await connection.send(prompt("nope"));
    expect(events).toMatchObject([{ type: "session.prompt_result", result: { type: "failed" } }]);
  });
});
