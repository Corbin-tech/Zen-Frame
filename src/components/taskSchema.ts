import { z } from 'zod';
import type { Task } from '../stores/taskTypes';

export const TaskSchema = z.object({
  id: z.string().min(1, "ID must not be empty"),
  todo: z.string().min(1, "Task must not be empty"),
  completed: z.boolean(),
  section: z.enum(['today', 'tomorrow', 'backlog', 'drag task from here']).default('drag task from here'),
  priority: z.enum(['none', 'low', 'medium', 'high']).default('none'),
  createdAt: z.string().optional(),
  completedAt: z.string().optional()
}) as z.ZodType<Task>;
