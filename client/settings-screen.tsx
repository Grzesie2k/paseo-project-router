import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import {
  Loading,
  ScrollView,
  SettingsAction,
  SettingsInput,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
} from "@getpaseo/plugin/client/ui";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import {
  cleanSettings,
  cleanTarget,
  emptyFallback,
  emptyRoute,
  validateIssues,
  type Choices,
  type Issue,
} from "../shared/form.js";
import { listChoices } from "../shared/rpc.js";
import { routingSettings, type RoutingSettings } from "../shared/settings.js";
import { Button } from "./kit.js";
import { RoutesTable, type TableRow } from "./routes-table.js";
import { PathFields, TargetFields, type FieldErrors } from "./target-editor.js";

const NO_CHOICES: Choices = { profiles: [], providers: [] };

type ScreenView = { kind: "list" } | { kind: "route"; uid: string } | { kind: "fallback" };

function errorsFor(issues: Issue[], target: Issue["target"]): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of issues) {
    if (issue.target === target && issue.field && !out[issue.field]) {
      out[issue.field] = issue.message.replace(/^[^:]+: /, "");
    }
  }
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function RoutingSettingsScreen({ theme, layout }: PluginSurfaceProps) {
  const settings = useSettings(routingSettings);
  const fetchChoices = useRpc(listChoices);
  const [choices, setChoices] = useState<Choices | null>(null);
  const [draft, setDraft] = useState<RoutingSettings | null>(null);
  // One stable id per route so per-route state and inputs follow the route when others are removed.
  const [uids, setUids] = useState<string[]>([]);
  const [storedUids, setStoredUids] = useState<string[]>([]);
  const [epoch, setEpoch] = useState(0);
  const [showIssues, setShowIssues] = useState(false);
  const [view, setView] = useState<ScreenView>({ kind: "list" });
  const counter = useRef(0);
  const nextUid = () => `r${counter.current++}`;
  const revision = settings.status === "ready" || settings.status === "invalid" ? settings.revision : null;
  const stored = settings.status === "ready" ? settings.values : null;

  useEffect(() => {
    let live = true;
    fetchChoices({})
      .then((result) => live && setChoices(result))
      .catch(() => live && setChoices(NO_CHOICES));
    return () => {
      live = false;
    };
  }, []);

  const load = (values: RoutingSettings) => {
    const ids = values.routes.map(nextUid);
    setDraft(values);
    setUids(ids);
    setStoredUids(ids);
    setEpoch((e) => e + 1);
    setShowIssues(false);
    setView({ kind: "list" });
  };

  useEffect(() => {
    if (stored) load(stored);
  }, [settings.status === "ready" ? settings.revision : null]);

  const known = choices && (choices.profiles.length || choices.providers.length) ? choices : null;
  const issues = useMemo(() => (draft ? validateIssues(draft, known) : []), [draft, known]);
  const dirty = useMemo(
    () => !!draft && !!stored && !same(cleanSettings(draft), cleanSettings(stored)),
    [draft, stored],
  );

  if (settings.status === "loading" || !choices) return <Loading />;
  if (settings.status === "error") {
    return (
      <SettingsSection title="Project router">
        <SettingsRow label="Could not load settings" error={settings.error} />
        <SettingsAction label="Settings" actionLabel="Retry" onPress={() => void settings.reload()} />
      </SettingsSection>
    );
  }
  if (settings.status === "invalid") {
    return (
      <SettingsSection title="Project router">
        <SettingsRow label="Stored settings are invalid" error={settings.error} />
        <SettingsAction label="Start over" hint="Discards the stored settings" actionLabel="Reset" onPress={() => void settings.reset()} />
      </SettingsSection>
    );
  }
  if (!draft || revision === null) return <Loading />;

  const c = theme.colors;
  const update = (next: RoutingSettings) => setDraft(next);
  const setRoute = (i: number, next: RoutingSettings["routes"][number]) =>
    update({ ...draft, routes: draft.routes.map((r, j) => (j === i ? next : r)) });
  const addRoute = () => {
    const uid = nextUid();
    setUids([...uids, uid]);
    update({ ...draft, routes: [...draft.routes, emptyRoute()] });
    setView({ kind: "route", uid });
  };
  const removeRoute = (i: number) => {
    setUids(uids.filter((_, j) => j !== i));
    update({ ...draft, routes: draft.routes.filter((_, j) => j !== i) });
    setView({ kind: "list" });
  };

  const save = async () => {
    setShowIssues(true);
    if (issues.length > 0) return;
    await settings.save(cleanSettings(draft), revision);
  };

  const routeIndex = view.kind === "route" ? uids.indexOf(view.uid) : -1;
  const editing = view.kind === "route" ? draft.routes[routeIndex] : view.kind === "fallback" ? draft.fallback : undefined;
  if (view.kind !== "list" && !editing) {
    setView({ kind: "list" });
    return <Loading />;
  }
  const storedSide: unknown =
    view.kind === "route" ? stored?.routes[storedUids.indexOf(view.uid)] : view.kind === "fallback" ? stored?.fallback : undefined;
  const itemDirty = !!editing && !same(cleanTarget(editing), storedSide ? cleanTarget(storedSide as typeof editing) : undefined);

  const discardItem = () => {
    if (view.kind === "route") {
      if (!storedSide) return removeRoute(routeIndex);
      setRoute(routeIndex, storedSide as RoutingSettings["routes"][number]);
    } else if (view.kind === "fallback") {
      if (!storedSide) {
        update({ ...draft, fallback: undefined });
        return setView({ kind: "list" });
      }
      update({ ...draft, fallback: storedSide as NonNullable<RoutingSettings["fallback"]> });
    }
    setEpoch((e) => e + 1);
  };

  const summary = showIssues ? [...new Set(issues.map((i) => i.message))] : [];
  const invalidTargets = new Set(showIssues ? issues.map((i) => i.target) : []);
  const rows: TableRow[] = draft.routes.map((route, i) => ({
    key: uids[i] ?? String(i),
    name: route.name.trim() || "New route",
    target: route,
    invalid: invalidTargets.has(i),
    open: () => setView({ kind: "route", uid: uids[i] }),
  }));
  if (draft.fallback) {
    rows.push({
      key: "fallback",
      name: "Fallback",
      target: draft.fallback,
      invalid: invalidTargets.has("fallback"),
      open: () => setView({ kind: "fallback" }),
    });
  }

  const statusText =
    view.kind === "list"
      ? dirty ? "Unsaved changes" : "All changes saved"
      : itemDirty ? "Unsaved changes" : dirty ? "Other routes have unsaved changes" : "All changes saved";
  const statusWarn = view.kind === "list" ? dirty : itemDirty || dirty;

  const bar = (
    <View
      style={{
        gap: 8,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderTopWidth: 1,
        borderTopColor: c.border,
        backgroundColor: c.surface1,
        // Keeps the save bar in view on pages taller than the window.
        ...({ position: "sticky", bottom: 0, zIndex: 10 } as object),
      }}
    >
      {summary.length > 0 ? (
        <View style={{ gap: 2 }}>
          <Text style={{ color: c.statusDanger, fontSize: 13, fontWeight: "600" }}>Fix these before saving</Text>
          {summary.map((message) => (
            <Text key={message} style={{ color: c.statusDanger, fontSize: 12 }}>
              {message}
            </Text>
          ))}
        </View>
      ) : null}
      {settings.saveError ? <Text style={{ color: c.statusDanger, fontSize: 13 }}>Save failed: {settings.saveError}</Text> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ flex: 1, color: statusWarn ? c.statusWarning : c.foregroundMuted, fontSize: 13 }}>{statusText}</Text>
        <Button
          theme={theme}
          label="Discard"
          disabled={settings.saving || (view.kind === "list" ? !dirty : !itemDirty)}
          onPress={() => (view.kind === "list" ? load(stored ?? draft) : discardItem())}
        />
        <Button
          theme={theme}
          kind="primary"
          label={settings.saving ? "Saving…" : "Save"}
          disabled={!dirty || settings.saving}
          onPress={() => void save()}
        />
      </View>
    </View>
  );

  if (view.kind === "list") {
    return (
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          <SettingsSection title="Enforcement">
            <SettingsSelect
              label="When a provider is not allowed"
              hint="Switch replaces it with the route's profile. Block refuses to start the agent and says why."
              value={draft.enforcement}
              options={[
                { label: "Off", value: "off" },
                { label: "Switch to the profile", value: "provider" },
                { label: "Block", value: "block" },
              ]}
              onValueChange={(enforcement) => update({ ...draft, enforcement })}
            />
          </SettingsSection>
          <SettingsSection title="Routes">
            <View style={{ paddingVertical: 4 }}>
              <RoutesTable
                theme={theme}
                compact={layout.compact}
                choices={choices}
                rows={rows}
                onAdd={addRoute}
                onAddFallback={draft.fallback ? undefined : () => {
                  update({ ...draft, fallback: emptyFallback() });
                  setView({ kind: "fallback" });
                }}
              />
            </View>
          </SettingsSection>
        </ScrollView>
        {bar}
      </View>
    );
  }

  const errors = showIssues ? errorsFor(issues, view.kind === "route" ? routeIndex : "fallback") : {};
  const title = view.kind === "route" ? ((editing as RoutingSettings["routes"][number]).name.trim() || "New route") : "Fallback";
  const remove = () => (view.kind === "route" ? removeRoute(routeIndex) : (update({ ...draft, fallback: undefined }), setView({ kind: "list" })));

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 4 }}>
          <Button theme={theme} icon="ArrowLeft" label="Back" onPress={() => setView({ kind: "list" })} />
          <Text numberOfLines={1} style={{ flex: 1, color: c.foreground, fontSize: 16, fontWeight: "600" }}>
            {title}
          </Text>
          <Button theme={theme} kind="danger" icon="Trash2" label={view.kind === "route" ? "Delete route" : "Delete fallback"} onPress={remove} />
        </View>
        <SettingsSection title={view.kind === "route" ? "Route" : "Used when no route matches the project path"}>
          {view.kind === "route" ? (
            <>
              <SettingsInput
                key={`${epoch}:${view.uid}`}
                label="Name"
                hint="Shown in logs"
                initialValue={(editing as RoutingSettings["routes"][number]).name}
                placeholder="Work"
                error={errors.name}
                onChangeText={(name) => setRoute(routeIndex, { ...draft.routes[routeIndex], name })}
              />
              <PathFields
                theme={theme}
                paths={(editing as RoutingSettings["routes"][number]).paths}
                error={errors.paths}
                onChange={(paths) => setRoute(routeIndex, { ...draft.routes[routeIndex], paths })}
              />
            </>
          ) : null}
          <TargetFields
            key={`${epoch}:${view.kind === "route" ? view.uid : "fallback"}`}
            theme={theme}
            target={editing!}
            choices={choices}
            errors={errors}
            onChange={(next) => (view.kind === "route" ? setRoute(routeIndex, next as RoutingSettings["routes"][number]) : update({ ...draft, fallback: next }))}
          />
        </SettingsSection>
      </ScrollView>
      {bar}
    </View>
  );
}
