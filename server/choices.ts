import { isSupportedForMetadata } from "./adapters.js";
import type { PaseoConfigView } from "./paseo-config.js";
import type { Choices } from "../shared/rpc.js";

export interface SnapshotEntry {
  provider: string;
  label?: string;
  models?: { id: string; label: string }[];
}

// Only providers configured and not disabled are offered; with none configured, the daemon snapshot decides.
export function isConfigured(config: PaseoConfigView, id: string): boolean {
  if (Object.keys(config.providers).length === 0) return true;
  const entry = config.providers[id];
  return !!entry && entry.enabled !== false;
}

// Providers come from the daemon snapshot when available and from the config otherwise.
export function buildChoices(config: PaseoConfigView, snapshot: readonly SnapshotEntry[] = []): Choices {
  const byId = new Map<string, Choices["providers"][number]>();

  const ensure = (id: string) => {
    let entry = byId.get(id);
    if (!entry) {
      entry = {
        id,
        label: config.providers[id]?.label ?? id,
        metadataSupported: isSupportedForMetadata(id, config.providers),
        models: [],
      };
      byId.set(id, entry);
    }
    return entry;
  };

  const addModels = (id: string, models: readonly { id: string; label: string }[]) => {
    const entry = ensure(id);
    for (const m of models) {
      if (!entry.models.some((known) => known.id === m.id)) entry.models.push({ id: m.id, label: m.label });
    }
  };

  for (const s of snapshot) {
    if (!isConfigured(config, s.provider)) continue;
    const entry = ensure(s.provider);
    if (s.label) entry.label = s.label;
    addModels(s.provider, s.models ?? []);
  }
  for (const [id, p] of Object.entries(config.providers)) if (isConfigured(config, id)) addModels(id, p.additionalModels ?? []);
  for (const p of config.profiles) if (isConfigured(config, p.provider)) ensure(p.provider);

  return {
    profiles: config.profiles.map((p) => ({
      id: p.id,
      name: p.name ?? p.id,
      provider: p.provider,
      ...(p.model ? { model: p.model } : {}),
    })),
    providers: [...byId.values()].sort((a, b) => a.label.localeCompare(b.label)),
  };
}
