import type { PluginCleanup } from "@getpaseo/plugin";
import type { PluginButtonContentProps, PluginClientContext } from "@getpaseo/plugin/client";
import React from "react";
import { Text, View } from "react-native";
import { noteText, pillLabel, type RouteInfo } from "../shared/describe.js";
import { describeAgent } from "../shared/rpc.js";

const POLL_MS = 5000;
// A pill is looked up a few times per agent: the creation hook can finish after the agent first appears.
const LOOKUPS = 4;

const infos = new Map<string, RouteInfo>();

function Details(props: PluginButtonContentProps) {
  const { theme } = props;
  const info = props.context === "agent" ? infos.get(props.agentId) : undefined;
  if (!info) return null;
  const c = theme.colors;
  const row = (label: string, value: string) => (
    <View key={label} style={{ flexDirection: "row", gap: 8 }}>
      <Text style={{ color: c.foregroundMuted, fontSize: 12, width: 72 }}>{label}</Text>
      <Text style={{ color: c.foreground, fontSize: 12, flex: 1 }}>{value}</Text>
    </View>
  );
  return (
    <View style={{ gap: 6, padding: 12, minWidth: 240 }}>
      <Text style={{ color: c.foreground, fontSize: 13, fontWeight: "600" }}>Project router</Text>
      {row(info.fallback ? "Match" : "Route", info.fallback ? "Fallback" : info.route)}
      {row("Profile", info.profile)}
      {row("Provider", info.provider)}
      {info.switchedFrom ? row("Switched", `from ${info.switchedFrom}`) : null}
    </View>
  );
}

// One composer pill per live agent that a route applied to.
export function contributePills(client: PluginClientContext): PluginCleanup {
  const pills = new Map<string, { workspaceId: string; remove(): void }>();
  const lookups = new Map<string, number>();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function tick() {
    try {
      const listed = await client.paseo.agents.list();
      const live = new Map<string, string>();
      for (const { agent } of listed.entries) {
        if (agent?.id && agent.workspaceId && agent.status !== "closed") live.set(agent.id, agent.workspaceId);
      }

      for (const [agentId, pill] of [...pills]) {
        if (live.get(agentId) === pill.workspaceId) continue;
        pill.remove();
        pills.delete(agentId);
        infos.delete(agentId);
      }
      for (const agentId of [...lookups.keys()]) if (!live.has(agentId)) lookups.delete(agentId);

      for (const [agentId, workspaceId] of live) {
        if (stopped || pills.has(agentId) || (lookups.get(agentId) ?? 0) >= LOOKUPS) continue;
        lookups.set(agentId, (lookups.get(agentId) ?? 0) + 1);
        const { info } = await client.rpc(describeAgent, { agentId });
        if (!info || stopped) continue;
        infos.set(agentId, info);
        const registration = client.addComposerPill({
          id: "route",
          workspaceId,
          agentId,
          button: {
            title: noteText(info),
            icon: "GitFork",
            label: pillLabel(info),
            behavior: { kind: "popover", Content: Details },
          },
        });
        pills.set(agentId, { workspaceId, remove: () => registration.remove() });
      }
    } catch (error) {
      console.warn("[project-router] pill refresh failed", String(error));
    }
    if (!stopped) timer = setTimeout(() => void tick(), POLL_MS);
  }

  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    for (const pill of pills.values()) pill.remove();
    pills.clear();
    infos.clear();
  };
}
