import type { PluginBeforeRequests } from "@getpaseo/plugin/server";

type AgentSessionConfig = PluginBeforeRequests["agent.create"]["config"];
import type { Profile } from "./paseo-config.js";
import type { Target } from "../shared/settings.js";

export function allowedProvidersFor(target: Target, profile: Profile): string[] {
  return target.allowedProviders.length > 0 ? target.allowedProviders : [profile.provider];
}

// Returns the config to use, or null when the requested provider is already allowed.
export function enforceProvider(
  config: AgentSessionConfig,
  target: Target,
  profile: Profile,
): AgentSessionConfig | null {
  if (allowedProvidersFor(target, profile).includes(config.provider)) return null;
  const next: AgentSessionConfig = { ...config, provider: profile.provider };
  delete next.model;
  delete next.modeId;
  delete next.thinkingOptionId;
  delete next.featureValues;
  if (profile.model !== undefined) next.model = profile.model;
  if (profile.modeId !== undefined) next.modeId = profile.modeId;
  if (profile.thinkingOptionId !== undefined) next.thinkingOptionId = profile.thinkingOptionId;
  if (profile.featureValues !== undefined) next.featureValues = { ...profile.featureValues };
  return next;
}

export type Decision =
  | { action: "allow" }
  | { action: "switch"; config: AgentSessionConfig }
  | { action: "block" };

// "block" keeps the request untouched; the caller rejects it with a message.
export function decide(
  mode: "provider" | "block",
  config: AgentSessionConfig,
  target: Target,
  profile: Profile,
): Decision {
  if (allowedProvidersFor(target, profile).includes(config.provider)) return { action: "allow" };
  if (mode === "block") return { action: "block" };
  const next = enforceProvider(config, target, profile);
  return next ? { action: "switch", config: next } : { action: "allow" };
}
