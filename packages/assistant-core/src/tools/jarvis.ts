import { tool } from "ai";
import { z } from "zod";

export const delegateCodingTaskInputSchema = z.object({
  instruction: z.string().trim().min(3).max(20_000),
  branchName: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._\/-]{0,119}$/).optional(),
  autoPush: z.boolean().default(false),
}).strict().superRefine(({ autoPush, branchName }, context) => {
  if (autoPush && !branchName) context.addIssue({ code: z.ZodIssueCode.custom, path: ["branchName"], message: "branchName is required when autoPush is enabled" });
});

const servicePayloadSchema = z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({});
export const controlSmartHomeDeviceInputSchema = z.object({
  domain: z.enum(["climate", "switch", "light"]),
  service: z.enum(["turn_on", "turn_off", "set_temperature"]),
  entityId: z.string().trim().regex(/^(climate|switch|light)\.[a-z0-9_]+$/),
  payload: servicePayloadSchema.optional(),
}).strict().superRefine(({ domain, service, entityId }, context) => {
  if (!entityId.startsWith(`${domain}.`)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["entityId"], message: "entityId must belong to the selected domain" });
  if (service === "set_temperature" && domain !== "climate") context.addIssue({ code: z.ZodIssueCode.custom, path: ["service"], message: "set_temperature is only valid for climate entities" });
});

export type DelegateCodingTaskInput = z.infer<typeof delegateCodingTaskInputSchema>;
export type ControlSmartHomeDeviceInput = z.infer<typeof controlSmartHomeDeviceInputSchema>;

export const delegateCodingTaskTool = tool({
  description: "Delegate a bounded coding change to the local headless coding CLI, validate the build, and optionally commit and push a named branch.",
  inputSchema: delegateCodingTaskInputSchema,
  execute: async (input) => ({ ok: true as const, command: "coding.delegate" as const, input }),
});

export const controlSmartHomeDeviceTool = tool({
  description: "Control a Home Assistant climate, switch, or light entity. Use set_temperature only for a climate entity.",
  inputSchema: controlSmartHomeDeviceInputSchema,
  execute: async (input) => ({ ok: true as const, command: "homeAssistant.callService" as const, input }),
});
