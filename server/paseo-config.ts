import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Profile {
  id: string;
  name?: string;
  provider: string;
  model?: string;
  modeId?: string;
  thinkingOptionId?: string;
  featureValues?: Record<string, unknown>;
}

export interface ModelEntry {
  id: string;
  label: string;
}

export interface ProviderEntry {
  enabled?: boolean;
  label?: string;
  extends?: string | null;
  additionalModels?: ModelEntry[];
  command?: string[];
  env?: Record<string, string>;
}

export interface PaseoConfigView {
  profiles: Profile[];
  providers: Record<string, ProviderEntry>;
}

export function paseoHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.PASEO_HOME || join(env.HOME || homedir(), ".paseo");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function modelEntries(value: unknown): ModelEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: ModelEntry[] = [];
  for (const m of value) {
    if (isRecord(m) && typeof m.id === "string") {
      out.push({ id: m.id, label: typeof m.label === "string" ? m.label : m.id });
    }
  }
  return out;
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) if (typeof v === "string") out[k] = v;
  return out;
}

export function parseConfigView(raw: unknown): PaseoConfigView {
  const root = isRecord(raw) ? raw : {};
  const daemon = isRecord(root.daemon) ? root.daemon : {};
  const agents = isRecord(root.agents) ? root.agents : {};

  const profiles: Profile[] = [];
  if (Array.isArray(daemon.agentProfiles)) {
    for (const p of daemon.agentProfiles) {
      if (!isRecord(p) || typeof p.id !== "string" || typeof p.provider !== "string") continue;
      profiles.push({
        id: p.id,
        provider: p.provider,
        ...(typeof p.name === "string" ? { name: p.name } : {}),
        ...(typeof p.model === "string" ? { model: p.model } : {}),
        ...(typeof p.modeId === "string" ? { modeId: p.modeId } : {}),
        ...(typeof p.thinkingOptionId === "string" ? { thinkingOptionId: p.thinkingOptionId } : {}),
        ...(isRecord(p.featureValues) ? { featureValues: p.featureValues } : {}),
      });
    }
  }

  const providers: Record<string, ProviderEntry> = {};
  if (isRecord(agents.providers)) {
    for (const [id, entry] of Object.entries(agents.providers)) {
      if (!isRecord(entry)) continue;
      const env = stringRecord(entry.env);
      const models = modelEntries(entry.additionalModels);
      providers[id] = {
        ...(typeof entry.enabled === "boolean" ? { enabled: entry.enabled } : {}),
        ...(typeof entry.label === "string" ? { label: entry.label } : {}),
        ...(models ? { additionalModels: models } : {}),
        ...(typeof entry.extends === "string" ? { extends: entry.extends } : {}),
        ...(Array.isArray(entry.command) && entry.command.every((c) => typeof c === "string")
          ? { command: entry.command as string[] }
          : {}),
        ...(env ? { env } : {}),
      };
    }
  }
  return { profiles, providers };
}

// Only daemon.agentProfiles and agents.providers are ever read from the file. A missing file is an empty config.
export async function loadPaseoConfig(env: NodeJS.ProcessEnv = process.env): Promise<PaseoConfigView> {
  let text: string;
  try {
    text = await readFile(join(paseoHome(env), "config.json"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { profiles: [], providers: {} };
    throw error;
  }
  return parseConfigView(JSON.parse(text));
}

export async function readPaseoConfig(env: NodeJS.ProcessEnv = process.env): Promise<PaseoConfigView> {
  try {
    return await loadPaseoConfig(env);
  } catch {
    return { profiles: [], providers: {} };
  }
}
