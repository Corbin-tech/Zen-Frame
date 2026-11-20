import type { AutoPlanResult } from "../stores/todoStore";

interface PlanContext {
  selectedDate: string;
  $store: { todos: {
    autoPlan(date: string, dayCount: number): AutoPlanResult;
    undoAutoPlan(plan: AutoPlanResult): number;
  } };
  lastPlan: AutoPlanResult | null;
  result: string;
}

export function plan(this: PlanContext, dayCount: number) {
  const planned = this.$store.todos.autoPlan(this.selectedDate, dayCount);
  const count = planned.blocks.length;
  if (count) this.lastPlan = planned;
  const days = new Set(planned.blocks.map(item => item.date)).size;
  this.result = count
    ? `Planned ${count} ${count === 1 ? 'task' : 'tasks'}${dayCount > 1 ? ` over ${days} ${days === 1 ? 'day' : 'days'}` : ''}.`
    : 'Nothing to plan: no free time left, or every open task already has a block.';
}

export function undo(this: PlanContext) {
  if (!this.lastPlan) return;
  const removed = this.$store.todos.undoAutoPlan(this.lastPlan);
  this.result = `Removed ${removed} planned ${removed === 1 ? 'block' : 'blocks'}.`;
  this.lastPlan = null;
}
