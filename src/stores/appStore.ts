import Alpine from "alpinejs";

export type View = "home" | "planner" | "zenmode" | "pomodoro";

// Initialize the app store
Alpine.store("app", {
  currentView: "home" as View,
});

// Export type for TypeScript support
declare global {
  interface Window {
    Alpine: typeof Alpine;
  }
}
