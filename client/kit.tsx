import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, ScrollView, TextInput } from "@getpaseo/plugin/client/ui";
import React from "react";
import { Dimensions, Pressable, Text, View } from "react-native";
import { customCandidate, describeModel, filterModels, type ModelOption } from "../shared/models.js";

type ButtonKind = "primary" | "secondary" | "danger";

interface ButtonProps {
  theme: PluginTheme;
  label: string;
  onPress(): void;
  kind?: ButtonKind;
  icon?: string;
  disabled?: boolean;
}

export function Button({ theme, label, onPress, kind = "secondary", icon, disabled }: ButtonProps) {
  const c = theme.colors;
  const fg = kind === "primary" ? c.accentForeground : kind === "danger" ? c.statusDanger : c.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingVertical: 7,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: kind === "primary" ? c.accent : c.border,
        backgroundColor: kind === "primary" ? c.accent : c.surface2,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon ? <Icon name={icon} size={14} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: 13, fontWeight: "500" }}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ theme, icon, label, onPress }: { theme: PluginTheme; icon: string; label: string; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={{
        width: 32,
        height: 32,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface2,
      }}
    >
      <Icon name={icon} size={15} color={theme.colors.foregroundMuted} />
    </Pressable>
  );
}

export function SelectedItem({ theme, label, muted, onRemove }: { theme: PluginTheme; label: string; muted?: boolean; onRemove(): void }) {
  const c = theme.colors;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 4,
        paddingLeft: 12,
        paddingRight: 4,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.surface2,
      }}
    >
      <Text style={{ flex: 1, color: muted ? c.statusWarning : c.foreground, fontSize: 14 }}>{label}</Text>
      <IconButton theme={theme} icon="X" label={`Remove ${label}`} onPress={onRemove} />
    </View>
  );
}

interface PathRowProps {
  theme: PluginTheme;
  value: string;
  onChange(text: string): void;
  onRemove(): void;
  index: number;
}

export function PathRow({ theme, value, onChange, onRemove, index }: PathRowProps) {
  const c = theme.colors;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="~/work/acme"
        placeholderTextColor={c.foregroundMuted}
        accessibilityLabel={`Path ${index + 1}`}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          flex: 1,
          minWidth: 0,
          color: c.foreground,
          backgroundColor: c.surface2,
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: 8,
          paddingVertical: 7,
          paddingHorizontal: 10,
          fontSize: 14,
        }}
      />
      <IconButton theme={theme} icon="Trash2" label={`Remove path ${index + 1}`} onPress={onRemove} />
    </View>
  );
}

const LIST_HEIGHT = 220;
const SAVE_BAR_ROOM = 120;

interface ModelPickerProps {
  theme: PluginTheme;
  models: readonly ModelOption[];
  value: string | undefined;
  onChange(next: string | undefined): void;
}

interface Choice {
  key: string;
  label: string;
  hint?: string;
  value: string | undefined;
}

export function ModelPicker({ theme, models, value, onChange }: ModelPickerProps) {
  const c = theme.colors;
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [up, setUp] = React.useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const box = React.useRef<View>(null);

  const current = describeModel(models, value);
  const shown = open ? query : current.text ? (current.inCatalog ? current.text : `${current.text} (not in catalog)`) : "";
  const matches = filterModels(models, query);
  const custom = customCandidate(models, query);
  const choices: Choice[] = [
    ...(query.trim() ? [] : [{ key: "default", label: "Provider default", value: undefined }]),
    ...matches.map((m) => ({ key: m.id, label: m.label, hint: m.id === m.label ? undefined : m.id, value: m.id })),
    ...(custom ? [{ key: "custom", label: `Use "${custom}" as model id`, value: custom }] : []),
  ];

  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const pick = (choice: Choice | undefined) => {
    if (choice) onChange(choice.value);
    close();
  };

  return (
    <View ref={box} style={{ position: "relative", zIndex: open ? 1000 : 0 }}>
      <TextInput
        value={shown}
        placeholder={open && current.text ? current.text : "Provider default"}
        placeholderTextColor={c.foregroundMuted}
        accessibilityLabel="Metadata model"
        autoCapitalize="none"
        autoCorrect={false}
        onFocus={() => {
          if (closeTimer.current) clearTimeout(closeTimer.current);
          // Open upward when the bottom of the screen (and the save bar) would cover the list.
          box.current?.measureInWindow((_x, y, _w, h) => {
            const below = Dimensions.get("window").height - (y + h) - SAVE_BAR_ROOM;
            setUp(below < LIST_HEIGHT && y > below);
          });
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => {
          // Let a press on a result land before the list disappears.
          closeTimer.current = setTimeout(close, 150);
        }}
        onChangeText={(text) => {
          setOpen(true);
          setQuery(text);
          setActive(0);
        }}
        onKeyPress={(e) => {
          const key = (e.nativeEvent as { key?: string }).key;
          if (!open && key === "ArrowDown") setOpen(true);
          else if (key === "ArrowDown") setActive((a) => Math.min(a + 1, choices.length - 1));
          else if (key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          else if (key === "Enter") pick(choices[active]);
          else if (key === "Escape") close();
        }}
        style={{
          color: current.inCatalog || open ? c.foreground : c.statusWarning,
          backgroundColor: c.surface2,
          borderWidth: 1,
          borderColor: open ? c.accent : c.border,
          borderRadius: 8,
          paddingVertical: 7,
          paddingHorizontal: 10,
          fontSize: 14,
        }}
      />
      {open ? (
        <View
          style={{
            position: "absolute",
            ...(up ? { bottom: "100%", marginBottom: 4 } : { top: "100%", marginTop: 4 }),
            left: 0,
            right: 0,
            zIndex: 1000,
            elevation: 12,
            maxHeight: LIST_HEIGHT,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 8,
            backgroundColor: c.surface1,
            overflow: "hidden",
            shadowColor: "#000",
            shadowOpacity: 0.35,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
          }}
        >
          <ScrollView keyboardShouldPersistTaps="always" nestedScrollEnabled>
            {matches.length === 0 && !custom ? (
              <Text style={{ color: c.foregroundMuted, fontSize: 13, padding: 10 }}>
                {models.length === 0 ? "No models listed for this provider. Type a model id." : "No matching models"}
              </Text>
            ) : null}
            {choices.map((choice, i) => (
              <Pressable
                key={choice.key}
                accessibilityRole="button"
                accessibilityLabel={choice.label}
                onPress={() => pick(choice)}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  backgroundColor: i === active ? c.surface2 : "transparent",
                }}
              >
                <Text style={{ color: choice.key === "custom" ? c.accent : c.foreground, fontSize: 14 }}>{choice.label}</Text>
                {choice.hint ? <Text style={{ color: c.foregroundMuted, fontSize: 11 }}>{choice.hint}</Text> : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
