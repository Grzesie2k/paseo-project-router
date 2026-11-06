import { z } from "zod";

export const routeInfoSchema = z.object({
  route: z.string(),
  fallback: z.boolean(),
  profile: z.string(),
  provider: z.string(),
  switchedFrom: z.string().optional(),
});

export type RouteInfo = z.output<typeof routeInfoSchema>;

export function noteText(info: RouteInfo): string {
  const where = info.fallback ? "fallback" : `route ${info.route}`;
  return info.switchedFrom
    ? `Switched from ${info.switchedFrom} → ${info.provider} (${where})`
    : `${info.fallback ? "Fallback" : `Route: ${info.route}`} · ${info.provider}`;
}

export function pillLabel(info: RouteInfo): string {
  return info.switchedFrom ? `Switched → ${info.provider}` : noteText(info);
}

export function timelineLine(info: RouteInfo): string {
  return `Project router: ${noteText(info)}`;
}

export interface PendingRoute {
  cwd: string;
  provider: string;
  at: number;
  info: RouteInfo;
}

export const PENDING_TTL_MS = 60_000;

// An agent claims the newest unexpired record for its cwd and effective provider.
export function matchPending(
  pending: readonly PendingRoute[],
  agent: { cwd: string; provider: string },
  now: number,
  ttl: number = PENDING_TTL_MS,
): PendingRoute | null {
  let best: PendingRoute | null = null;
  for (const p of pending) {
    if (now - p.at > ttl || p.cwd !== agent.cwd || p.provider !== agent.provider) continue;
    if (!best || p.at > best.at) best = p;
  }
  return best;
}

export function blockMessage(provider: string, route: string, fallback: boolean, profile: string): string {
  const where = fallback ? "fallback" : `route ${route}`;
  return `Provider ${provider} is not allowed in this project (${where}). Use profile ${profile}.`;
}
