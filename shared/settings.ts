import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

const target = {
  profileId: z.string().min(1),
  // Empty means: only the provider of the profile.
  allowedProviders: z.array(z.string().min(1)).default([]),
  metadataProvider: z.string().optional(),
  metadataModel: z.string().optional(),
};

export const routeSchema = z.object({
  name: z.string().min(1),
  paths: z.array(z.string().min(1)).default([]),
  ...target,
});

export const fallbackSchema = z.object(target);

export const settingsSchema = z.object({
  routes: z.array(routeSchema).default([]),
  fallback: fallbackSchema.optional(),
  enforcement: z.enum(["provider", "block", "off"]).default("off"),
});

export type RoutingSettings = z.output<typeof settingsSchema>;
export type Route = z.output<typeof routeSchema>;
export type Fallback = z.output<typeof fallbackSchema>;
export type Target = Route | Fallback;

export const routingSettings = defineSettings({
  id: "routing",
  scope: "host",
  version: 1,
  schema: settingsSchema,
});
