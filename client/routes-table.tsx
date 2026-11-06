import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import React from "react";
import { Pressable, Text, View } from "react-native";
import type { Choices } from "../shared/form.js";
import type { Fallback, Route } from "../shared/settings.js";
import { Button } from "./kit.js";

export type Target = Route | Fallback;

interface Column {
  title: string;
  flex: number;
  text(target: Target, choices: Choices): string;
}

const NONE = "—";

function pathsText(target: Target): string {
  if (!("paths" in target)) return NONE;
  const paths = target.paths.map((p) => p.trim()).filter(Boolean);
  if (paths.length === 0) return NONE;
  return paths.length > 1 ? `${paths[0]} +${paths.length - 1}` : paths[0];
}

function profileText(target: Target, choices: Choices): string {
  if (!target.profileId) return NONE;
  return choices.profiles.find((p) => p.id === target.profileId)?.name ?? `${target.profileId} (not found)`;
}

function allowedText(target: Target, choices: Choices): string {
  if (target.allowedProviders.length === 0) return "Profile's only";
  return target.allowedProviders.map((id) => choices.providers.find((p) => p.id === id)?.label ?? id).join(", ");
}

function metadataText(target: Target, choices: Choices): string {
  if (!target.metadataProvider) return NONE;
  const label = choices.providers.find((p) => p.id === target.metadataProvider)?.label ?? target.metadataProvider;
  return target.metadataModel?.trim() ? `${label} / ${target.metadataModel.trim()}` : label;
}

const COLUMNS: Column[] = [
  { title: "Paths", flex: 1.6, text: pathsText },
  { title: "Profile", flex: 1.1, text: profileText },
  { title: "Allowed providers", flex: 1.2, text: allowedText },
  { title: "Metadata", flex: 1.4, text: metadataText },
];

export interface TableRow {
  key: string;
  name: string;
  target: Target;
  invalid: boolean;
  open(): void;
}

interface Props {
  theme: PluginTheme;
  compact: boolean;
  choices: Choices;
  rows: TableRow[];
  onAdd(): void;
  onAddFallback?: () => void;
}

export function RoutesTable({ theme, compact, choices, rows, onAdd, onAddFallback }: Props) {
  const c = theme.colors;
  const muted = { color: c.foregroundMuted, fontSize: 12 } as const;
  return (
    <View style={{ gap: 12 }}>
      <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, backgroundColor: c.surface1, overflow: "hidden" }}>
        {!compact ? (
          <View style={{ flexDirection: "row", gap: 12, paddingVertical: 8, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <Text style={[muted, { flex: 1.2 }]}>Name</Text>
            {COLUMNS.map((col) => (
              <Text key={col.title} style={[muted, { flex: col.flex }]}>
                {col.title}
              </Text>
            ))}
            <View style={{ width: 16 }} />
          </View>
        ) : null}
        {rows.length === 0 ? (
          <Text style={[muted, { padding: 16, fontSize: 13 }]}>
            No routes yet. A route sends agents, and the titles, branches and commit text Paseo writes for them, to a provider profile based on the project path.
          </Text>
        ) : null}
        {rows.map((row, i) => (
          <Pressable
            key={row.key}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${row.name}`}
            onPress={row.open}
            style={{
              flexDirection: compact ? "column" : "row",
              alignItems: compact ? "stretch" : "center",
              gap: compact ? 4 : 12,
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: c.border,
            }}
          >
            <View style={{ flex: compact ? undefined : 1.2, flexDirection: "row", alignItems: "center", gap: 6 }}>
              {row.invalid ? <Icon name="CircleAlert" size={14} color={c.statusDanger} /> : null}
              <Text numberOfLines={1} style={{ color: row.invalid ? c.statusDanger : c.foreground, fontSize: 14, fontWeight: "600", flexShrink: 1 }}>
                {row.name}
              </Text>
              {compact ? <View style={{ flex: 1 }} /> : null}
              {compact ? <Icon name="ChevronRight" size={16} color={c.foregroundMuted} /> : null}
            </View>
            {COLUMNS.map((col) => (
              <Text key={col.title} numberOfLines={compact ? 2 : 1} style={{ flex: compact ? undefined : col.flex, color: c.foregroundMuted, fontSize: 13 }}>
                {compact ? `${col.title}: ` : ""}
                {col.text(row.target, choices)}
              </Text>
            ))}
            {!compact ? <Icon name="ChevronRight" size={16} color={c.foregroundMuted} /> : null}
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button theme={theme} icon="Plus" label="Add route" onPress={onAdd} />
        {onAddFallback ? <Button theme={theme} icon="Plus" label="Add fallback" onPress={onAddFallback} /> : null}
      </View>
    </View>
  );
}
