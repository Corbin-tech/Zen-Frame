import { z } from 'zod';

export type Task = {
  id: string;
  todo: string;
  completed: boolean;
  group: string;
  priority: "none" | "low" | "medium" | "high";
  createdAt?: string;
  completedAt?: string;
};

export const TaskSchema: z.ZodType<Task, z.ZodTypeDef, Task> = 
  (z.object({
    id: z.string().min(1, "ID must not be empty"),
    todo: z.string().min(1, "Task must not be empty"),
    completed: z.boolean(),
    group: z.enum(["today", "tomorrow", "backlog", "planner"]).default("planner"),
    priority: z.enum(["none", "low", "medium", "high"]).default("none"),
    createdAt: z.string().optional(),
    completedAt: z.string().optional(),
  }) as unknown) as z.ZodType<Task, z.ZodTypeDef, Task>;

// Group schema updates
export type Group = {
  id: string;
  name: string;
};

export const GroupSchema: z.ZodType<Group, z.ZodTypeDef, Group> = 
  (z.object({
    id: z.string().min(1, "Group ID must not be empty"),
    name: z.string().min(1, "Group name must not be empty")
  }) as unknown) as z.ZodType<Group, z.ZodTypeDef, Group>;

export const GroupsSchema: z.ZodType<Group[], z.ZodTypeDef, Group[]> = 
  (z.array(GroupSchema) as unknown) as z.ZodType<Group[], z.ZodTypeDef, Group[]>;
