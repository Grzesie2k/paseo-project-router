import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import React from "react";
import { Text, View } from "react-native";
import { z } from "zod";
import { routeInfoSchema, timelineLine } from "../shared/describe.js";

export const routeNoteSchema = routeInfoSchema.extend({ text: z.string().optional() });

export function RouteNote({ item, theme }: PluginTimelineItemProps<z.output<typeof routeNoteSchema>>) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 }}>
      <Icon name="GitFork" size={13} color={theme.colors.foregroundMuted} />
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{timelineLine(item.data)}</Text>
    </View>
  );
}
