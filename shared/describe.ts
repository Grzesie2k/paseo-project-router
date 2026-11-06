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
  token: string;
  at: number;
  info: RouteInfo;
}

export const PENDING_TTL_MS = 60_000;

const isFresh = (p: PendingRoute, now: number, ttl: number) => now - p.at < ttl;

export function prunePending(pending: readonly PendingRoute[], now: number, ttl: number = PENDING_TTL_MS): PendingRoute[] {
  return pending.filter((p) => isFresh(p, now, ttl));
}

// A route is claimed by the token it attached to its create request.
export function matchPending(
  pending: readonly PendingRoute[],
  token: string,
  now: number,
  ttl: number = PENDING_TTL_MS,
): PendingRoute | null {
  return pending.find((p) => p.token === token && isFresh(p, now, ttl)) ?? null;
}

export function blockMessage(provider: string, route: string, fallback: boolean, profile: string): string {
  const where = fallback ? "fallback" : `route ${route}`;
  return `Provider ${provider} is not allowed in this project (${where}). Use profile ${profile}.`;
}
