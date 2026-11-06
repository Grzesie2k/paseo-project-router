import type { PluginTheme } from "@getpaseo/plugin";
import { SettingsRow, SettingsSelect } from "@getpaseo/plugin/client/ui";
import React from "react";
import { View } from "react-native";
import { toggleProvider, type Choices, type IssueField } from "../shared/form.js";
import type { Fallback, Route } from "../shared/settings.js";
import { Button, ModelPicker, PathRow, SelectedItem } from "./kit.js";

const NONE = "";

export type FieldErrors = Partial<Record<IssueField, string>>;

interface Props<T extends Route | Fallback> {
  theme: PluginTheme;
  target: T;
  choices: Choices;
  errors: FieldErrors;
  onChange(next: T): void;
}

// Fields shared by routes and the fallback; routes add name and paths around it.
export function TargetFields<T extends Route | Fallback>({ theme, target, choices, errors, onChange }: Props<T>) {
  const set = (patch: Partial<Route>) => onChange({ ...target, ...patch });
  const metaProvider = choices.providers.find((p) => p.id === target.metadataProvider);
  const knownModels = metaProvider?.models ?? [];
  const profileOptions = [
    { label: "Choose a profile", value: NONE },
    ...choices.profiles.map((p) => ({ label: `${p.name} (${p.provider})`, value: p.id })),
  ];
  if (target.profileId && !choices.profiles.some((p) => p.id === target.profileId)) {
    profileOptions.push({ label: `${target.profileId} (not found)`, value: target.profileId });
  }
  const providerOptions = [
    { label: "None", value: NONE },
    ...choices.providers.map((p) => ({
      label: p.metadataSupported ? p.label : `${p.label} (cannot generate metadata)`,
      value: p.id,
    })),
  ];
  if (target.metadataProvider && !metaProvider) {
    providerOptions.push({ label: `${target.metadataProvider} (not configured)`, value: target.metadataProvider });
  }
  const labelOf = (id: string) => choices.providers.find((p) => p.id === id)?.label ?? id;
  const addable = choices.providers.filter((p) => !target.allowedProviders.includes(p.id));

  return (
    <>
      <SettingsSelect
        label="Profile"
        hint="Agents in this project are moved to this profile"
        value={target.profileId}
        options={profileOptions}
        error={errors.profileId}
        onValueChange={(profileId) => set({ profileId })}
      />
      <SettingsRow
        label="Allowed providers"
        hint="Agents on other providers are switched to the profile. None selected allows only the profile's provider."
        error={errors.allowedProviders}
      >
        <View style={{ gap: 8 }}>
          {target.allowedProviders.map((id) => (
            <SelectedItem
              key={id}
              theme={theme}
              label={choices.providers.some((p) => p.id === id) ? labelOf(id) : `${id} (not configured)`}
              muted={!choices.providers.some((p) => p.id === id)}
              onRemove={() => set({ allowedProviders: toggleProvider(target.allowedProviders, id, false) })}
            />
          ))}
        </View>
      </SettingsRow>
      {addable.length > 0 ? (
        <SettingsSelect
          label="Add provider"
          value={NONE}
          options={[{ label: "Choose a provider", value: NONE }, ...addable.map((p) => ({ label: p.label, value: p.id }))]}
          onValueChange={(id) => id && set({ allowedProviders: toggleProvider(target.allowedProviders, id, true) })}
        />
      ) : null}
      <SettingsSelect
        label="Metadata provider"
        hint="Writes titles, branch names, commit messages and PR text"
        value={target.metadataProvider ?? NONE}
        options={providerOptions}
        error={errors.metadataProvider}
        onValueChange={(id) => {
          set({ metadataProvider: id || undefined, metadataModel: undefined });
        }}
      />
      {target.metadataProvider ? (
        <SettingsRow label="Metadata model" hint="Search the provider's models, or type a model id. Empty uses the provider default.">
          <ModelPicker
            // Remount when the provider changes so the open state and query reset.
            key={target.metadataProvider}
            theme={theme}
            models={knownModels}
            value={target.metadataModel}
            onChange={(metadataModel) => set({ metadataModel })}
          />
        </SettingsRow>
      ) : null}
    </>
  );
}

interface PathFieldsProps {
  theme: PluginTheme;
  paths: string[];
  error?: string;
  onChange(next: string[]): void;
}

export function PathFields({ theme, paths, error, onChange }: PathFieldsProps) {
  return (
    <SettingsRow label="Project paths" hint="Agents started in a directory under any of these paths use this route" error={error}>
      <View style={{ gap: 8 }}>
        {paths.map((path, i) => (
          <PathRow
            // Paths have no identity, so rows are keyed by position; the inputs are controlled.
            key={i}
            theme={theme}
            index={i}
            value={path}
            onChange={(text) => onChange(paths.map((p, j) => (j === i ? text : p)))}
            onRemove={() => onChange(paths.filter((_, j) => j !== i))}
          />
        ))}
        <View style={{ flexDirection: "row" }}>
          <Button theme={theme} icon="Plus" label="Add path" onPress={() => onChange([...paths, ""])} />
        </View>
      </View>
    </SettingsRow>
  );
}
