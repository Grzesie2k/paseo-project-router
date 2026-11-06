import { randomUUID } from "node:crypto";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { PaseoApi } from "@getpaseo/client";
import { describeAgent, listChoices } from "./shared/rpc.js";
import { blockMessage, matchPending, noteText, prunePending, type PendingRoute, type RouteInfo } from "./shared/describe.js";
import { routingSettings } from "./shared/settings.js";
import { buildChoices } from "./server/choices.js";
import { createMetadataProvider, METADATA_PROVIDER_ID } from "./server/metadata-provider.js";
import { loadPaseoConfig, readPaseoConfig, type PaseoConfigView } from "./server/paseo-config.js";
import { decide } from "./server/policy.js";
import { routeForCwd, targetLabel } from "./server/routing.js";

const ROUTE_TOKEN_ENV = "PASEO_PROJECT_ROUTER_TOKEN";
const SNAPSHOT_MAX_AGE_MS = 30_000;

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(routingSettings);

  async function currentSettings() {
    const state = await settings.read();
    if (state.status !== "ready") throw new Error(`Invalid routing settings: ${state.error}`);
    return state.values;
  }

  let snapshotCache: { at: number; entries: Parameters<typeof buildChoices>[1] } | null = null;

  async function loadChoices(paseo: PaseoApi, config?: PaseoConfigView, maxAgeMs = 0) {
    const now = Date.now();
    if (!snapshotCache || now - snapshotCache.at >= maxAgeMs) {
      const entries = await paseo.providers
        .snapshot()
        .then((result) => result.entries)
        .catch(() => []);
      snapshotCache = { at: now, entries };
    }
    return buildChoices(config ?? (await readPaseoConfig()), snapshotCache.entries);
  }

  server.handle(listChoices, (_input, { paseo }) => loadChoices(paseo));

  // Routes chosen at creation time are tagged with a token in the request env; the session open claims it.
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
    if (request.config.provider === METADATA_PROVIDER_ID) return;
    const mode = state.values.enforcement;

    const selected = await routeForCwd(request.config.cwd, state.values);
    if (!selected) return;
    const route = targetLabel(selected);
    const fallback = selected.kind === "fallback";

    // Block mode must not let an unverifiable route through.
    const unenforceable = (reason: string) => {
      console.warn(`[project-router] route ${route}: ${reason}`);
      if (mode === "block") throw new Error(`Project router cannot verify route ${route}: ${reason}`);
    };

    let config: PaseoConfigView;
    try {
      config = await loadPaseoConfig();
    } catch (error) {
      return unenforceable(`cannot read Paseo config (${error instanceof Error ? error.message : String(error)})`);
    }
    const profile = config.profiles.find((p) => p.id === selected.target.profileId);
    if (!profile) return unenforceable(`profile "${selected.target.profileId}" not found`);

    const choices = await loadChoices(paseo, config, SNAPSHOT_MAX_AGE_MS);
    const label = (id: string) => choices.providers.find((p) => p.id === id)?.label ?? id;
    const profileName = choices.profiles.find((p) => p.id === profile.id)?.name ?? profile.id;

    const decision = decide(mode, request.config, selected.target, profile);
    if (decision.action === "block") {
      console.info(`[project-router] route ${route}: blocked ${request.config.provider}`);
      throw new Error(blockMessage(label(request.config.provider), route, fallback, profileName));
    }

    const next = decision.action === "switch" ? decision.config : request.config;
    const info: RouteInfo = {
      route,
      fallback,
      profile: profileName,
      provider: label(next.provider),
      ...(decision.action === "switch" ? { switchedFrom: label(request.config.provider) } : {}),
    };
    const now = Date.now();
    const token = randomUUID();
    pending = [...prunePending(pending, now), { token, at: now, info }];

    if (decision.action === "switch") {
      console.info(`[project-router] route ${route}: ${request.config.provider} -> ${next.provider}`);
    }
    return { ...request, config: next, env: { ...request.env, [ROUTE_TOKEN_ENV]: token } };
  });

  server.addHook("agent.open.before", async ({ request }) => {
    const token = request.env[ROUTE_TOKEN_ENV];
    if (token === undefined) return;
    const { [ROUTE_TOKEN_ENV]: _token, ...env } = request.env;
    const hit = matchPending(pending, token, Date.now());
    if (hit && request.reason === "create") {
      pending = pending.filter((p) => p !== hit);
      byAgent.set(request.agentId, hit.info);
    }
    return { ...request, env };
  });

  server.addHook("agent.create.after", async ({ agent }, { paseo }) => {
    const info = byAgent.get(agent.id);
    if (!info) return;
    await paseo.agents
      .ref(agent.id)
      .timeline.append({
        type: "plugin",
        id: `route-note-${agent.id}`,
        kind: "route-note",
        version: 1,
        data: { ...info, text: noteText(info) },
      })
      .catch((error: unknown) => console.warn(`[project-router] timeline note failed: ${String(error)}`));
  });

  server.addHook("agent.close.after", async ({ agent }) => {
    byAgent.delete(agent.id);
  });

  return () => {};
}
