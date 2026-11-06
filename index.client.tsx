import type { PluginClientContext } from "@getpaseo/plugin/client";
import { RouteNote, routeNoteSchema } from "./client/route-note.js";
import { contributePills } from "./client/route-pill.js";
import { RoutingSettingsScreen } from "./client/settings-screen.js";

export default function contribute(client: PluginClientContext) {
  const cleanups = [
    client.addSettingsScreen({
      id: "routing",
      title: "Project router",
      icon: "GitFork",
      Component: RoutingSettingsScreen,
    }),
    client.addTimelineRenderer({ kind: "route-note", version: 1, schema: routeNoteSchema, Component: RouteNote }),
    contributePills(client),
  ];
  return () => {
    for (const cleanup of cleanups) void cleanup();
  };
}
