// The three areas of the app (brand plan 6.2). Each area groups some of the 8 view ids.
// The view ids do not change: stores, backups, and change-tab events still use them.

export type ViewId = "dashboard" | "schedule" | "zenmode" | "pomodoro" | "taskmanager" | "board" | "goals" | "insights";
type AreaId = "today" | "focus" | "library";

interface Area {
  id: AreaId;
  label: string;
  views: readonly ViewId[];
}

export const AREAS: readonly Area[] = [
  { id: "today", label: "Today", views: ["dashboard", "schedule"] },
  { id: "focus", label: "Focus", views: ["zenmode", "pomodoro"] },
  { id: "library", label: "Library", views: ["taskmanager", "board", "goals", "insights"] },
];

// The area that holds a view. An unknown id falls back to Today, as safeTab() falls back to the Overview.
export function areaOf(view: string): Area {
  return AREAS.find(area => (area.views as readonly string[]).includes(view)) ?? AREAS[0];
}
