import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { routeInfoSchema } from "./describe.js";

export const choicesSchema = z.object({
  profiles: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      provider: z.string(),
      model: z.string().optional(),
    }),
  ),
  providers: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      metadataSupported: z.boolean(),
      models: z.array(z.object({ id: z.string(), label: z.string() })),
    }),
  ),
});

export type Choices = z.output<typeof choicesSchema>;

export const listChoices = defineRpc({
  name: "routing.list-choices",
  input: z.object({}),
  output: choicesSchema,
});

export const describeAgent = defineRpc({
  name: "routing.describe-agent",
  input: z.object({ agentId: z.string() }),
  output: z.object({ info: routeInfoSchema.nullable() }),
});
