import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import type { Fallback, Route, RoutingSettings, Target } from "../shared/settings.js";

export function expandHome(path: string, home: string = homedir()): string {
  if (path === "~") return home;
  if (path.startsWith("~/") || path.startsWith(`~${sep}`)) return join(home, path.slice(2));
  return path;
}

function canonical(path: string, home?: string): string {
  const abs = resolve(expandHome(path, home));
  try {
    return realpathSync(abs);
  } catch {
    return abs;
  }
}

function covers(prefix: string, path: string): boolean {
  return path === prefix || path.startsWith(prefix.endsWith(sep) ? prefix : prefix + sep);
}

// Worktrees share the common git dir with the main repo, so their root is the main checkout.
export function resolveProjectRoot(cwd: string): Promise<string> {
  return new Promise((done) => {
    execFile(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd, timeout: 5000 },
      (error, stdout) => {
        const common = error ? "" : stdout.trim();
        done(canonical(common ? dirname(common) : cwd));
      },
    );
  });
}

export type Selected =
  | { kind: "route"; target: Route }
  | { kind: "fallback"; target: Fallback };

export function selectTarget(
  root: string,
  settings: Pick<RoutingSettings, "routes" | "fallback">,
  home?: string,
): Selected | null {
  let best: { route: Route; length: number } | null = null;
  for (const route of settings.routes) {
    for (const path of route.paths) {
      const prefix = canonical(path, home);
      if (covers(prefix, root) && (!best || prefix.length > best.length)) {
        best = { route, length: prefix.length };
      }
    }
  }
  if (best) return { kind: "route", target: best.route };
  if (settings.fallback) return { kind: "fallback", target: settings.fallback };
  return null;
}

export async function routeForCwd(
  cwd: string,
  settings: Pick<RoutingSettings, "routes" | "fallback">,
  home?: string,
): Promise<Selected | null> {
  if (settings.routes.length === 0 && !settings.fallback) return null;
  return selectTarget(await resolveProjectRoot(cwd), settings, home);
}

export function targetLabel(selected: Selected): string {
  return selected.kind === "route" ? selected.target.name : "fallback";
}

export type { Target };
