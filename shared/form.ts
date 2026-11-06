import type { Choices } from "./rpc.js";
import { settingsSchema, type Fallback, type Route, type RoutingSettings } from "./settings.js";

export type { Choices };

export function emptyRoute(): Route {
  return { name: "", paths: [""], profileId: "", allowedProviders: [] };
}

export function emptyFallback(): Fallback {
  return { profileId: "", allowedProviders: [] };
}

export function toggleProvider(allowed: readonly string[], id: string, on: boolean): string[] {
  const rest = allowed.filter((p) => p !== id);
  return on ? [...rest, id] : rest;
}

// Blank entries are dropped and empty metadata fields are omitted before saving.
export function cleanTarget<T extends Route | Fallback>(target: T): T {
  const next = { ...target } as T & { paths?: string[]; metadataProvider?: string; metadataModel?: string };
  if ("paths" in next && next.paths) next.paths = next.paths.map((p) => p.trim()).filter(Boolean);
  if (!next.metadataProvider) delete next.metadataProvider;
  next.metadataModel = next.metadataModel?.trim() || undefined;
  if (!next.metadataModel || !next.metadataProvider) delete next.metadataModel;
  return next;
}

export function cleanSettings(values: RoutingSettings): RoutingSettings {
  return {
    ...values,
    routes: values.routes.map(cleanTarget),
    ...(values.fallback ? { fallback: cleanTarget(values.fallback) } : {}),
  };
}

export type IssueField = "name" | "profileId" | "paths" | "allowedProviders" | "metadataProvider";

export interface Issue {
  // Route index, "fallback", or null for problems that belong to no single target.
  target: number | "fallback" | null;
  field: IssueField | null;
  message: string;
}

function checkTarget(
  where: Issue["target"],
  label: string,
  target: Route | Fallback,
  choices: Choices | null,
  issues: Issue[],
) {
  if (!choices) return;
  const add = (field: IssueField, message: string) => issues.push({ target: where, field, message: `${label}: ${message}` });
  if (target.profileId && !choices.profiles.some((p) => p.id === target.profileId)) {
    add("profileId", `unknown profile "${target.profileId}"`);
  }
  for (const id of target.allowedProviders) {
    if (!choices.providers.some((p) => p.id === id)) add("allowedProviders", `unknown provider "${id}"`);
  }
  const meta = choices.providers.find((p) => p.id === target.metadataProvider);
  if (target.metadataProvider && !meta) {
    add("metadataProvider", `unknown metadata provider "${target.metadataProvider}"`);
  } else if (meta && !meta.metadataSupported) {
    add("metadataProvider", `${meta.label} cannot generate metadata`);
  }
}

// Like validateSettings, but each problem says which route and field it belongs to.
export function validateIssues(values: RoutingSettings, choices: Choices | null): Issue[] {
  const cleaned = cleanSettings(values);
  const issues: Issue[] = [];

  cleaned.routes.forEach((route, i) => {
    const label = route.name ? `Route "${route.name}"` : `Route ${i + 1}`;
    const add = (field: IssueField, message: string) => issues.push({ target: i, field, message: `${label}: ${message}` });
    if (!route.name.trim()) add("name", "name is required");
    if (!route.profileId) add("profileId", "choose a profile");
    if (route.paths.length === 0) add("paths", "add at least one path");
    checkTarget(i, label, route, choices, issues);
  });
  if (cleaned.fallback) {
    if (!cleaned.fallback.profileId) {
      issues.push({ target: "fallback", field: "profileId", message: "Fallback: choose a profile" });
    }
    checkTarget("fallback", "Fallback", cleaned.fallback, choices, issues);
  }

  const names = cleaned.routes.map((r) => r.name.trim());
  for (const dup of new Set(names.filter((n, i) => n && names.indexOf(n) !== i))) {
    names.forEach((n, i) => {
      if (n === dup && names.indexOf(n) !== i) {
        issues.push({ target: i, field: "name", message: `Route name "${dup}" is used more than once` });
      }
    });
  }
  if (issues.length === 0) {
    const parsed = settingsSchema.safeParse(cleaned);
    if (!parsed.success) {
      issues.push(...parsed.error.issues.map((i) => ({ target: null, field: null, message: `${i.path.join(".")}: ${i.message}` })));
    }
  }
  return issues;
}

// Returns messages instead of throwing; an empty list means the values can be saved.
export function validateSettings(values: RoutingSettings, choices: Choices | null): string[] {
  const messages = validateIssues(values, choices).map((i) => i.message);
  return [...new Set(messages)];
}
