import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { PaseoApi } from "@getpaseo/client";
import { describeAgent, listChoices } from "./shared/rpc.js";
import { blockMessage, matchPending, noteText, type PendingRoute, type RouteInfo } from "./shared/describe.js";
import { routingSettings } from "./shared/settings.js";
import { buildChoices } from "./server/choices.js";
import { createMetadataProvider } from "./server/metadata-provider.js";
import { readPaseoConfig } from "./server/paseo-config.js";
import { decide } from "./server/policy.js";
import { routeForCwd, targetLabel } from "./server/routing.js";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(routingSettings);

  async function currentSettings() {
    const state = await settings.read();
    if (state.status !== "ready") throw new Error(`Invalid routing settings: ${state.error}`);
    return state.values;
  }

  async function loadChoices(paseo: PaseoApi) {
    const config = await readPaseoConfig();
    const snapshot = await paseo.providers
      .snapshot()
      .then((result) => result.entries)
      .catch(() => []);
    return buildChoices(config, snapshot);
  }

  server.handle(listChoices, (_input, { paseo }) => loadChoices(paseo));

  // Routes chosen at creation time, waiting for their agent id, then kept per agent.
  let pending: PendingRoute[] = [];
  const byAgent = new Map<string, RouteInfo>();

  server.handle(describeAgent, async ({ agentId }) => ({ info: byAgent.get(agentId) ?? null }));

  server.registerProvider(
    createMetadataProvider({
      getSettings: currentSettings,
      log: (message) => console.info(`[project-router] ${message}`),
    }),
  );

  server.before("agent.create", async ({ request }, { paseo }) => {
    const state = await settings.read();
    if (state.status !== "ready" || state.values.enforcement === "off") return;
    const mode = state.values.enforcement;

    const selected = await routeForCwd(request.config.cwd, state.values);
    if (!selected) return;

    const { profiles } = await readPaseoConfig();
    const profile = profiles.find((p) => p.id === selected.target.profileId);
    if (!profile) {
      console.warn(`[project-router] profile not found for route ${targetLabel(selected)}`);
      return;
    }

    const choices = await loadChoices(paseo);
    const label = (id: string) => choices.providers.find((p) => p.id === id)?.label ?? id;
    const profileName = choices.profiles.find((p) => p.id === profile.id)?.name ?? profile.id;
    const route = targetLabel(selected);
    const fallback = selected.kind === "fallback";

    const decision = decide(mode, request.config, selected.target, profile);
    if (decision.action === "block") {
      console.info(`[project-router] route ${route}: blocked ${request.config.provider}`);
      throw new Error(blockMessage(label(request.config.provider), route, fallback, profileName));
    }

    const config = decision.action === "switch" ? decision.config : request.config;
    const info: RouteInfo = {
      route,
      fallback,
      profile: profileName,
      provider: label(config.provider),
      ...(decision.action === "switch" ? { switchedFrom: label(request.config.provider) } : {}),
    };
    const now = Date.now();
    pending = pending.filter((p) => now - p.at < 60_000);
    pending.push({ cwd: request.config.cwd, provider: config.provider, at: now, info });

    if (decision.action !== "switch") return;
    console.info(`[project-router] route ${route}: ${request.config.provider} -> ${config.provider}`);
    return { ...request, config };
  });

  server.addHook("agent.create.after", async ({ agent }, { paseo }) => {
    const hit = matchPending(pending, agent, Date.now());
    if (!hit) return;
    pending = pending.filter((p) => p !== hit);
    byAgent.set(agent.id, hit.info);
    await paseo.agents
      .ref(agent.id)
      .timeline.append({
        type: "plugin",
        id: `route-note-${agent.id}`,
        kind: "route-note",
        version: 1,
        data: { ...hit.info, text: noteText(hit.info) },
      })
      .catch((error: unknown) => console.warn(`[project-router] timeline note failed: ${String(error)}`));
  });

  server.addHook("agent.close.after", async ({ agent }) => {
    byAgent.delete(agent.id);
  });

  return () => {};
}
