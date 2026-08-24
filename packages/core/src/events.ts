import { z } from 'zod';

const EventBaseSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  timestampMs: z.number().nonnegative(),
});

export const ClickEventSchema = EventBaseSchema.extend({
  kind: z.literal('click'),
  selector: z.string().min(1),
  button: z.enum(['left', 'middle', 'right']),
});

export const TypeEventSchema = EventBaseSchema.extend({
  kind: z.literal('type'),
  selector: z.string().min(1),
  value: z.string(),
});

export const NavigateEventSchema = EventBaseSchema.extend({
  kind: z.literal('navigate'),
  url: z.url(),
});

export const InputEventSchema = z.discriminatedUnion('kind', [
  ClickEventSchema,
  TypeEventSchema,
  NavigateEventSchema,
]);

export type ClickEvent = z.infer<typeof ClickEventSchema>;
export type TypeEvent = z.infer<typeof TypeEventSchema>;
export type NavigateEvent = z.infer<typeof NavigateEventSchema>;
export type InputEvent = z.infer<typeof InputEventSchema>;
