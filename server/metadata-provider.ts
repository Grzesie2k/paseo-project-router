import { randomUUID } from "node:crypto";
import type {
  ProviderConnection,
  ProviderEvent,
  ProviderInput,
  ProviderRegistration,
} from "@getpaseo/plugin/server/provider";
import type { RoutingSettings } from "../shared/settings.js";
import { buildInvocation, resolveAdapter, runInvocation } from "./adapters.js";
import { readPaseoConfig, type PaseoConfigView } from "./paseo-config.js";
import { routeForCwd, targetLabel } from "./routing.js";

export const METADATA_PROVIDER_ID = "metadata-router";
export const METADATA_MODEL_ID = "auto";

export interface MetadataProviderDeps {
  getSettings(): Promise<Pick<RoutingSettings, "routes" | "fallback">>;
  readConfig?(): Promise<PaseoConfigView>;
  run?: typeof runInvocation;
  log?(message: string): void;
}

type PromptInput = Extract<ProviderInput, { type: "session.prompt" }>;

// Models often wrap JSON in code fences or prose; return the bare JSON when it can be found.
export function extractJson(text: string): string {
  const candidates = [text.trim()];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced) candidates.push(fenced[1].trim());
  const open = text.search(/[{[]/);
  const close = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (open !== -1 && close > open) candidates.push(text.slice(open, close + 1));
  for (const candidate of candidates) {
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // try the next candidate
    }
  }
  return text;
}

export async function generateMetadataText(
  cwd: string,
  prompt: string,
  deps: MetadataProviderDeps,
  signal?: AbortSignal,
): Promise<string> {
  const settings = await deps.getSettings();
  const selected = await routeForCwd(cwd, settings);
  if (!selected) throw new Error("No route or fallback matches this project");
  const { metadataProvider, metadataModel } = selected.target;
  if (!metadataProvider) throw new Error(`Route "${targetLabel(selected)}" has no metadata provider`);

  const config = await (deps.readConfig ?? readPaseoConfig)();
  const adapter = resolveAdapter(metadataProvider, config.providers);
  if (!adapter) throw new Error(`Provider "${metadataProvider}" is not supported for metadata generation`);

  deps.log?.(`metadata via ${metadataProvider} for route ${targetLabel(selected)}`);
  const invocation = buildInvocation(adapter, metadataModel, prompt);
  return (deps.run ?? runInvocation)(invocation, { cwd, signal });
}

function textOf(input: PromptInput["prompt"]["input"]): string {
  if (input.type === "command") return `${input.name} ${input.arguments}`.trim();
  return input.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");
}

function withSchema(text: string, schema: unknown): string {
  if (schema === undefined) return text;
  return `${text}\n\nRespond with JSON only, matching this JSON schema:\n${JSON.stringify(schema)}`;
}

export function createMetadataConnection(deps: MetadataProviderDeps): ProviderConnection {
  const listeners = new Set<(event: ProviderEvent) => void>();
  const sessions = new Map<string, { cwd: string; abort?: AbortController }>();
  const emit = (event: ProviderEvent) => listeners.forEach((listener) => listener(event));

  async function runPrompt(sessionId: string, input: PromptInput): Promise<void> {
    const session = sessions.get(sessionId);
    if (!session) {
      emit({
        type: "session.prompt_result",
        sessionId,
        clientMessageId: input.prompt.clientMessageId,
        result: { type: "failed", error: { message: `Unknown session ${sessionId}` } },
      });
      return;
    }
    const turnId = randomUUID();
    const abort = new AbortController();
    session.abort = abort;
    emit({
      type: "session.prompt_result",
      sessionId,
      clientMessageId: input.prompt.clientMessageId,
      result: { type: "turn", turnId },
    });
    emit({ type: "session.turn", sessionId, turnId, state: "started" });
    try {
      const prompt = withSchema(textOf(input.prompt.input), input.prompt.outputSchema);
      const output = await generateMetadataText(session.cwd, prompt, deps, abort.signal);
      const text = input.prompt.outputSchema === undefined ? output : extractJson(output);
      emit({
        type: "timeline.item",
        sessionId,
        item: { id: randomUUID(), type: "assistant_message", text },
      });
      emit({ type: "session.turn", sessionId, turnId, state: "completed" });
    } catch (error) {
      if (abort.signal.aborted) {
        emit({ type: "session.turn", sessionId, turnId, state: "canceled" });
      } else {
        emit({
          type: "session.turn",
          sessionId,
          turnId,
          state: "failed",
          error: { message: error instanceof Error ? error.message : String(error) },
        });
      }
    } finally {
      if (session.abort === abort) session.abort = undefined;
    }
  }

  return {
    version: 1,
    capabilities: ["prompt.message", "prompt.output_schema"],
    async send(input) {
      switch (input.type) {
        case "catalog":
          emit({
            type: "catalog",
            requestId: input.requestId,
            catalog: {
              models: [
                {
                  id: METADATA_MODEL_ID,
                  label: "Auto (routed by project)",
                  isDefault: true,
                },
              ],
              modes: [{ id: "default", label: "Default" }],
              defaultModel: METADATA_MODEL_ID,
              defaultMode: "default",
            },
          });
          return;
        case "session.open":
          sessions.set(input.sessionId, { cwd: input.config.cwd });
          emit({
            type: "session.opened",
            requestId: input.requestId,
            sessionId: input.sessionId,
            capabilities: ["prompt.message", "prompt.output_schema"],
            restoration: "core",
            cwd: input.config.cwd,
          });
          emit({ type: "session.ready", requestId: input.requestId, sessionId: input.sessionId });
          return;
        case "session.prompt":
          void runPrompt(input.sessionId, input);
          return;
        case "session.interrupt":
          sessions.get(input.sessionId)?.abort?.abort();
          emit({ type: "request.completed", requestId: input.requestId });
          return;
        case "session.close":
          sessions.get(input.sessionId)?.abort?.abort();
          sessions.delete(input.sessionId);
          emit({ type: "request.completed", requestId: input.requestId });
          return;
        default:
          if ("requestId" in input) {
            emit({
              type: "request.failed",
              requestId: input.requestId,
              error: { message: `Unsupported request: ${input.type}` },
            });
          }
      }
    },
    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async close() {
      for (const session of sessions.values()) session.abort?.abort();
      sessions.clear();
      listeners.clear();
    },
  };
}

export function createMetadataProvider(deps: MetadataProviderDeps): ProviderRegistration {
  return {
    id: METADATA_PROVIDER_ID,
    label: "Metadata router",
    description: "Runs title, branch, commit and PR text generation on the provider routed for the project",
    status: async () => ({ available: true }),
    connect: async () => createMetadataConnection(deps),
  };
}
