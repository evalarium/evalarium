import { z } from 'zod';

export const TaskSpecSchema = z.object({
  id: z.string().min(1),
  fixture: z.string().min(1),
  instructions: z.string().min(1),
});

export type TaskSpec = z.infer<typeof TaskSpecSchema>;
