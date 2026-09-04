import type { z } from "zod";

export function defineJsonCodec<Schema extends z.ZodTypeAny>(schema: Schema) {
  return {
    parse(value: string): z.infer<Schema> {
      return schema.parse(JSON.parse(value));
    },
    safeParse(value: string) {
      try {
        return schema.safeParse(JSON.parse(value));
      } catch (error) {
        return { success: false as const, error };
      }
    },
    serialize(value: z.input<Schema>): string {
      return JSON.stringify(schema.parse(value));
    },
  };
}
