import { ALARM_SOUNDS, playAlarmSound, type AlarmSound } from "../lib/sounds";
import { permission, requestPermission } from "../lib/notifications";
import { loadJson, saveJson } from "../lib/storage";
import { applyAccentFavicon } from "../lib/favicon";

// Preferences, saved under "settings" in localStorage. The inline script in
// Layout.astro applies accent, font, and text size before the page paints;
// the matching CSS lives in src/styles/preferences.css.

const ACCENTS = [
  { id: "teal", label: "Teal", swatch: "#036672" },
  { id: "ocean", label: "Ocean", swatch: "#0284c7" },
  { id: "lavender", label: "Lavender", swatch: "#7c3aed" },
  { id: "rose", label: "Rose", swatch: "#be123c" },
  { id: "sunset", label: "Sunset", swatch: "#ea580c" },
  { id: "forest", label: "Forest", swatch: "#059669" },
  { id: "midnight", label: "Midnight", swatch: "#4f46e5" },
  { id: "orchid", label: "Orchid", swatch: "#c026d3" },
  { id: "honey", label: "Honey", swatch: "#b45309" }
] as const;

const FONTS = [
  { id: "inter", label: "Inter", sample: "'Inter Variable', system-ui, sans-serif" },
  { id: "system", label: "System", sample: "system-ui, sans-serif" },
  { id: "rounded", label: "Rounded", sample: "ui-rounded, 'SF Pro Rounded', system-ui, sans-serif" },
  { id: "serif", label: "Serif", sample: "ui-serif, 'Iowan Old Style', Charter, Georgia, serif" },
  { id: "mono", label: "Mono", sample: "ui-monospace, 'SF Mono', Menlo, monospace" },
  { id: "outfit", label: "Outfit", sample: "'Outfit Variable', system-ui, sans-serif" },
  { id: "lexend", label: "Lexend", sample: "'Lexend Variable', system-ui, sans-serif" },
  { id: "atkinson", label: "Atkinson", sample: "'Atkinson Hyperlegible Next Variable', system-ui, sans-serif" }
] as const;

const TEXT_SIZES = [
  { id: "sm", label: "Small" },
  { id: "md", label: "Default" },
  { id: "lg", label: "Large" },
  { id: "xl", label: "Extra large" }
] as const;

// Where the tabs go. The sidebar shows on wide screens; narrow ones keep the top bar.
const NAV_LAYOUTS = [
  { id: "top", label: "Top bar" },
  { id: "side", label: "Sidebar" }
] as const;

// Faces for the Pomodoro timer, drawn in TimerFaces.astro
const TIMER_STYLES = [
  { id: "classic", label: "Classic", hint: "Progress ring" },
  { id: "chess", label: "Chess clock", hint: "Focus against break" },
  { id: "apple", label: "Apple", hint: "Twist kitchen timer" },
  { id: "cat", label: "Cat", hint: "Watches the seconds" },
  { id: "digital", label: "Digital", hint: "Seven-segment LCD" },
  { id: "nixie", label: "Nixie tube", hint: "Glowing neon digits" },
  { id: "flip", label: "Flip", hint: "Split-flap cards" },
  { id: "hourglass", label: "Hourglass", hint: "Sand runs through" },
  { id: "bloom", label: "Bloom", hint: "A plant grows as you focus" }
] as const;

// Dashboard widgets. "stats" is the row of key numbers across the top; the rest go in the
// main or side column, in any order. Widgets in neither list are hidden.
export const DASHBOARD_WIDGETS = [
  { id: "stats", label: "Key numbers", hint: "Open tasks, done today, planned, focus", zone: "top" },
  { id: "plan", label: "Today's plan", hint: "Today's blocks from the schedule", zone: "column" },
  { id: "clusters", label: "Clusters", hint: "Progress for each cluster", zone: "column" },
  { id: "completed", label: "Tasks completed", hint: "The last 7 days", zone: "column" },
  { id: "upnext", label: "Up next", hint: "The next task, with a focus button", zone: "column" },
  { id: "deadlines", label: "Deadlines", hint: "Past due and the next 14 days", zone: "column" },
  { id: "recent", label: "Recently completed", hint: "Your last few finished tasks", zone: "column" },
  { id: "focus", label: "Focus timer", hint: "Start a focus session from here", zone: "column" },
  { id: "goals", label: "Goals", hint: "Progress on your open goals", zone: "column" },
  { id: "notes", label: "Notes", hint: "Pinned and recent notes", zone: "column" },
  { id: "quote", label: "Quote of the day", hint: "A new one each morning", zone: "column" },
  { id: "streak", label: "Streak", hint: "Days in a row and the last two weeks", zone: "column" }
] as const;

export interface DashboardLayout {
  top: string[];
  main: string[];
  side: string[];
}

const DEFAULT_DASHBOARD: DashboardLayout = {
  top: ["stats"],
  main: ["plan", "clusters", "completed"],
  side: ["upnext", "deadlines", "recent"]
};

// Next step extras, each a switch under Settings > Next step
const ZEN_OPTIONS = [
  { key: "zenShowCluster", label: "Cluster and position", hint: "Which cluster the task is in, and where" },
  { key: "zenShowDue", label: "Due date", hint: "When the task is due" },
  { key: "zenShowNext", label: "Up next", hint: "The two tasks after this one" },
  { key: "zenShowProgress", label: "Progress bar", hint: "Tasks completed out of all tasks" },
  { key: "showQuotes", label: "Calming quotes", hint: "A quote that changes each time you finish a task" }
] as const;

// Moving scenes behind Zen mode, drawn in ZenBackdrop.astro. All are slow and still under reduced motion.
const ZEN_BACKGROUNDS = [
  { id: "none", label: "None", hint: "Just the card" },
  { id: "glow", label: "Soft glow", hint: "Drifting colored light" },
  { id: "desk", label: "Zen garden", hint: "Raked sand, moss and pine" },
  { id: "koi", label: "Koi pond", hint: "Koi under lily pads" },
  { id: "swirly", label: "Swirly night", hint: "Spirals and stars" },
  { id: "birds", label: "Birds", hint: "Flocks across the sky" },
  { id: "rain", label: "Rainy window", hint: "Rain on the glass" },
  { id: "fireflies", label: "Fireflies", hint: "A meadow at dusk" },
  { id: "aurora", label: "Aurora", hint: "Northern lights over a lake" },
  { id: "sakura", label: "Sakura", hint: "Cherry blossoms drifting" }
] as const;

// When confetti fires in Zen mode: what finishing a task has to wrap up. Smallest first;
// src/lib/confetti.ts fires for the chosen milestone and every bigger one. Unclustered tasks
// count as one cluster.
export const CONFETTI_TRIGGERS = [
  { id: "task", label: "Every task" },
  { id: "cluster", label: "Every cluster" },
  { id: "all", label: "All done" }
] as const;

// How many months of "seen" monthly stories to remember
const SEEN_MONTHS_KEPT = 24;

// Minutes before a scheduled block starts that its reminder fires
const BLOCK_LEADS = [0, 5, 10, 15, 30];

type Accent = typeof ACCENTS[number]["id"];
type Font = typeof FONTS[number]["id"];
type TextSize = typeof TEXT_SIZES[number]["id"];
type TimerStyle = typeof TIMER_STYLES[number]["id"];
type NavLayout = typeof NAV_LAYOUTS[number]["id"];
type ZenBackground = typeof ZEN_BACKGROUNDS[number]["id"];
export type Milestone = typeof CONFETTI_TRIGGERS[number]["id"];

interface Settings {
  name: string;
  accent: Accent;
  font: Font;
  textSize: TextSize;
  confetti: boolean;
  confettiTrigger: Milestone;
  navLayout: NavLayout;
  sidebarCollapsed: boolean; // Sidebar shows icons only
  showQuotes: boolean;
  zenShowCluster: boolean;
  zenShowDue: boolean;
  zenShowNext: boolean;
  zenShowProgress: boolean;
  zenBackground: ZenBackground;
  dashboardLayout: DashboardLayout;
  timerStyle: TimerStyle;
  pomoAutoStartBreak: boolean;
  pomoAutoStartFocus: boolean;
  alarmSound: AlarmSound;
  alarmVolume: number; // 0 to 1
  notifyEnabled: boolean; // Master switch for reminders and alerts
  notifyTimer: boolean; // Pomodoro session finished
  notifyBlocks: boolean; // A scheduled block is about to start
  notifyBlockLead: number; // One of BLOCK_LEADS
  notifyDue: boolean; // Daily summary of tasks due today and overdue
  notifyDueTime: string; // "HH:MM"
  recapSeenMonths: string[]; // Months ("YYYY-MM") whose monthly story was watched to the end
}

const DEFAULTS: Settings = {
  name: "",
  accent: "teal",
  font: "inter",
  textSize: "md",
  confetti: true,
  confettiTrigger: "cluster",
  navLayout: "top",
  sidebarCollapsed: false,
  showQuotes: true,
  zenShowCluster: true,
  zenShowDue: true,
  zenShowNext: false,
  zenShowProgress: true,
  zenBackground: "none",
  dashboardLayout: DEFAULT_DASHBOARD,
  timerStyle: "classic",
  pomoAutoStartBreak: false,
  pomoAutoStartFocus: false,
  alarmSound: "classic",
  alarmVolume: 0.7,
  notifyEnabled: false,
  notifyTimer: true,
  notifyBlocks: true,
  notifyBlockLead: 5,
  notifyDue: true,
  notifyDueTime: "09:00",
  recapSeenMonths: []
};

// Known widgets in the right zone, each placed once
function cleanLayout(saved: unknown): DashboardLayout {
  if (!saved || typeof saved !== "object") return structuredClone(DEFAULT_DASHBOARD);
  const placed = new Set<string>();
  const keep = (list: unknown, zone: "top" | "column") => (Array.isArray(list) ? list : []).filter(id => {
    const widget = DASHBOARD_WIDGETS.find(item => item.id === id);
    if (!widget || widget.zone !== zone || placed.has(id)) return false;
    placed.add(id);
    return true;
  });
  const layout = saved as Partial<DashboardLayout>;
  return { top: keep(layout.top, "top"), main: keep(layout.main, "column"), side: keep(layout.side, "column") };
}

// Valid months, oldest first, the newest ones only. A missing or broken list gives none.
function cleanMonths(saved: unknown): string[] {
  const months = (Array.isArray(saved) ? saved : []).filter(month => typeof month === "string" && /^\d{4}-\d{2}$/.test(month));
  return [...new Set<string>(months)].sort().slice(-SEEN_MONTHS_KEPT);
}

// Keeps only known values, so an old or edited save can't break the page
function loadSettings(): Settings {
  const saved = loadJson<Partial<Settings>>("settings", {});
  const flag = (value: unknown, fallback: boolean) => typeof value === "boolean" ? value : fallback;
  const pick = <T extends string>(value: unknown, options: readonly { id: T }[], fallback: T): T =>
    options.some(option => option.id === value) ? value as T : fallback;

  return {
    name: typeof saved.name === "string" ? saved.name : DEFAULTS.name,
    accent: pick(saved.accent, ACCENTS, DEFAULTS.accent),
    font: pick(saved.font, FONTS, DEFAULTS.font),
    textSize: pick(saved.textSize, TEXT_SIZES, DEFAULTS.textSize),
    confetti: flag(saved.confetti, DEFAULTS.confetti),
    confettiTrigger: pick(saved.confettiTrigger, CONFETTI_TRIGGERS, DEFAULTS.confettiTrigger),
    navLayout: pick(saved.navLayout, NAV_LAYOUTS, DEFAULTS.navLayout),
    sidebarCollapsed: flag(saved.sidebarCollapsed, DEFAULTS.sidebarCollapsed),
    showQuotes: flag(saved.showQuotes, DEFAULTS.showQuotes),
    zenShowCluster: flag(saved.zenShowCluster, DEFAULTS.zenShowCluster),
    zenShowDue: flag(saved.zenShowDue, DEFAULTS.zenShowDue),
    zenShowNext: flag(saved.zenShowNext, DEFAULTS.zenShowNext),
    zenShowProgress: flag(saved.zenShowProgress, DEFAULTS.zenShowProgress),
    // Older saves had an on/off "zenAmbient" switch, which was the soft glow
    zenBackground: pick(saved.zenBackground, ZEN_BACKGROUNDS, (saved as { zenAmbient?: boolean }).zenAmbient ? "glow" : DEFAULTS.zenBackground),
    dashboardLayout: cleanLayout(saved.dashboardLayout),
    timerStyle: pick(saved.timerStyle, TIMER_STYLES, DEFAULTS.timerStyle),
    pomoAutoStartBreak: flag(saved.pomoAutoStartBreak, DEFAULTS.pomoAutoStartBreak),
    pomoAutoStartFocus: flag(saved.pomoAutoStartFocus, DEFAULTS.pomoAutoStartFocus),
    alarmSound: pick(saved.alarmSound, ALARM_SOUNDS, DEFAULTS.alarmSound),
    alarmVolume: typeof saved.alarmVolume === "number" ? Math.min(1, Math.max(0, saved.alarmVolume)) : DEFAULTS.alarmVolume,
    notifyEnabled: flag(saved.notifyEnabled, DEFAULTS.notifyEnabled),
    notifyTimer: flag(saved.notifyTimer, DEFAULTS.notifyTimer),
    notifyBlocks: flag(saved.notifyBlocks, DEFAULTS.notifyBlocks),
    notifyBlockLead: BLOCK_LEADS.includes(saved.notifyBlockLead as number) ? saved.notifyBlockLead as number : DEFAULTS.notifyBlockLead,
    notifyDue: flag(saved.notifyDue, DEFAULTS.notifyDue),
    notifyDueTime: typeof saved.notifyDueTime === "string" && /^\d{2}:\d{2}$/.test(saved.notifyDueTime) ? saved.notifyDueTime : DEFAULTS.notifyDueTime,
    recapSeenMonths: cleanMonths(saved.recapSeenMonths)
  };
}

export function initSettingsStore() {
  return {
    ...DEFAULTS,
    savedJson: {} as Partial<Record<keyof Settings, string>>,
    accents: ACCENTS,
    fonts: FONTS,
    textSizes: TEXT_SIZES,
    confettiTriggers: CONFETTI_TRIGGERS,
    navLayouts: NAV_LAYOUTS,
    timerStyles: TIMER_STYLES,
    zenOptions: ZEN_OPTIONS,
    zenBackgrounds: ZEN_BACKGROUNDS,
    alarmSounds: ALARM_SOUNDS,
    blockLeads: BLOCK_LEADS,
    // The browser's answer to the notification prompt: "default", "granted", "denied", or "unsupported"
    notificationPermission: "default" as NotificationPermission | "unsupported",

    // Alpine calls init() when the store is registered
    init(): void {
      this.load();
      this.notificationPermission = permission();
      this.apply();
      window.addEventListener("storage", event => {
        if (event.storageArea !== localStorage || (event.key !== null && event.key !== "settings")) return;
        this.load();
        this.apply();
      });
    },

    get firstName(): string {
      return this.name.trim().split(/\s+/)[0] ?? "";
    },

    update(changes: Partial<Settings>): void {
      Object.assign(this, changes);
      this.apply();
      this.save();
    },

    reset(): void {
      // Resets preferences. The name, the reminder switch, and which monthly stories were watched are kept.
      this.update({ ...DEFAULTS, dashboardLayout: structuredClone(DEFAULT_DASHBOARD), name: this.name, notifyEnabled: this.notifyEnabled, recapSeenMonths: this.recapSeenMonths });
    },

    setDashboardLayout(layout: DashboardLayout): void {
      this.update({ dashboardLayout: cleanLayout(layout) });
    },

    // A month's story was watched to the end, so its entry on Insights can shrink
    markRecapSeen(month: string): void {
      if (this.recapSeenMonths.includes(month)) return;
      this.update({ recapSeenMonths: cleanMonths([...this.recapSeenMonths, month]) });
    },

    resetDashboardLayout(): void {
      this.setDashboardLayout(structuredClone(DEFAULT_DASHBOARD));
    },

    load(): void {
      const remote = loadSettings();
      for (const key of Object.keys(DEFAULTS) as (keyof Settings)[]) {
        const base = this.savedJson[key];
        if (base === undefined || JSON.stringify(this[key]) === base) {
          Object.assign(this, { [key]: remote[key] });
        }
        this.savedJson[key] = JSON.stringify(remote[key]);
      }
    },

    save(): void {
      this.load();
      const saved = Object.fromEntries(Object.keys(DEFAULTS).map(key => [key, this[key as keyof Settings]]));
      const dirty = (Object.keys(DEFAULTS) as (keyof Settings)[]).some(key => JSON.stringify(this[key]) !== this.savedJson[key]);
      if (dirty && saveJson("settings", saved)) {
        for (const key of Object.keys(DEFAULTS) as (keyof Settings)[]) this.savedJson[key] = JSON.stringify(this[key]);
      }
      this.apply();
    },

    // Turning reminders on asks the browser for permission (it must follow a click).
    // In-app toasts still show if the browser says no.
    async setNotifications(enabled: boolean): Promise<void> {
      if (enabled) this.notificationPermission = await requestPermission();
      this.update({ notifyEnabled: enabled });
    },

    apply(): void {
      const root = document.documentElement;
      root.dataset.accent = this.accent;
      root.dataset.font = this.font;
      root.dataset.textSize = this.textSize;
      root.dataset.nav = this.navLayout;
      root.dataset.sidebar = this.sidebarCollapsed ? "collapsed" : "open";
      applyAccentFavicon();
    },

    playAlarm(sound?: AlarmSound): void {
      playAlarmSound(sound ?? this.alarmSound, this.alarmVolume);
    }
  };
}
