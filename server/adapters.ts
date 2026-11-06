import { spawn } from "node:child_process";
import type { ProviderEntry } from "./paseo-config.js";

export type AdapterKind = "claude" | "opencode";

export interface Adapter {
  kind: AdapterKind;
  command: string;
  env: Record<string, string>;
}

export interface Invocation {
  command: string;
  args: string[];
  env: Record<string, string>;
  stdin: string;
}

const ROOT_KINDS: Record<string, AdapterKind> = { claude: "claude", opencode: "opencode" };

// Follows `extends` to a built-in root; the nearest command and the merged env win.
export function resolveAdapter(
  providerId: string,
  providers: Record<string, ProviderEntry>,
): Adapter | null {
  const chain: string[] = [];
  let current: string | undefined = providerId;
  while (current && !chain.includes(current)) {
    chain.push(current);
    if (ROOT_KINDS[current] && !providers[current]?.extends) break;
    current = providers[current]?.extends ?? undefined;
  }
  const root = chain[chain.length - 1];
  const kind = root ? ROOT_KINDS[root] : undefined;
  if (!kind || providers[root]?.extends) return null;

  let command: string | undefined;
  const env: Record<string, string> = {};
  for (const id of [...chain].reverse()) {
    const entry = providers[id];
    if (entry?.env) Object.assign(env, entry.env);
  }
  for (const id of chain) {
    const first = providers[id]?.command?.[0];
    if (first) {
      command = first;
      break;
    }
  }
  return { kind, command: command ?? kind, env };
}

export function isSupportedForMetadata(
  providerId: string,
  providers: Record<string, ProviderEntry>,
): boolean {
  return resolveAdapter(providerId, providers) !== null;
}

export function buildInvocation(adapter: Adapter, model: string | undefined, prompt: string): Invocation {
  const env = { ...adapter.env };
  if (adapter.kind === "claude") {
    return {
      command: adapter.command,
      args: ["-p", ...(model ? ["--model", model] : [])],
      env,
      stdin: prompt,
    };
  }
  return {
    command: adapter.command,
    args: ["run", ...(model ? ["-m", model] : [])],
    env,
    stdin: prompt,
  };
}

export function runInvocation(
  invocation: Invocation,
  options: { cwd?: string; signal?: AbortSignal; timeoutMs?: number },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: options.cwd,
      env: { ...process.env, ...invocation.env },
      stdio: ["pipe", "pipe", "pipe"],
      signal: options.signal,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), options.timeoutMs ?? 120_000);
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${invocation.command} exited with code ${code}: ${stderr.trim().slice(0, 500)}`));
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(invocation.stdin);
  });
}
