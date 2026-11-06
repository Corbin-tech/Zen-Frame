import { ALARM_SOUNDS, playAlarmSound, type AlarmSound } from "../lib/sounds";
import { permission, requestPermission } from "../lib/notifications";
import { loadJson } from "../lib/storage";

// Preferences, saved under "settings" in localStorage. The inline script in
// Layout.astro applies accent, font, and text size before the page paints;
// the matching CSS lives in src/styles/preferences.css.

export const ACCENTS = [
  { id: "teal", label: "Teal", swatch: "#047481" },
  { id: "ocean", label: "Ocean", swatch: "#0284c7" },
  { id: "lavender", label: "Lavender", swatch: "#7c3aed" },
  { id: "rose", label: "Rose", swatch: "#e11d48" },
  { id: "sunset", label: "Sunset", swatch: "#ea580c" },
  { id: "forest", label: "Forest", swatch: "#059669" }
] as const;

export const FONTS = [
  { id: "inter", label: "Inter", sample: "'Inter Variable', system-ui, sans-serif" },
  { id: "system", label: "System", sample: "system-ui, sans-serif" },
  { id: "rounded", label: "Rounded", sample: "ui-rounded, 'SF Pro Rounded', system-ui, sans-serif" },
  { id: "serif", label: "Serif", sample: "ui-serif, 'Iowan Old Style', Charter, Georgia, serif" },
  { id: "mono", label: "Mono", sample: "ui-monospace, 'SF Mono', Menlo, monospace" }
] as const;

export const TEXT_SIZES = [
  { id: "sm", label: "Small" },
  { id: "md", label: "Default" },
  { id: "lg", label: "Large" },
  { id: "xl", label: "Extra large" }
] as const;

// Minutes before a scheduled block starts that its reminder fires
export const BLOCK_LEADS = [0, 5, 10, 15, 30];

type Accent = typeof ACCENTS[number]["id"];
type Font = typeof FONTS[number]["id"];
type TextSize = typeof TEXT_SIZES[number]["id"];

interface Settings {
  name: string;
  accent: Accent;
  font: Font;
  textSize: TextSize;
  showQuotes: boolean;
  alarmSound: AlarmSound;
  alarmVolume: number; // 0 to 1
  notifyEnabled: boolean; // Master switch for reminders and alerts
  notifyTimer: boolean; // Pomodoro session finished
  notifyBlocks: boolean; // A scheduled block is about to start
  notifyBlockLead: number; // One of BLOCK_LEADS
  notifyDue: boolean; // Daily summary of tasks due today and overdue
  notifyDueTime: string; // "HH:MM"
}

const DEFAULTS: Settings = {
  name: "",
  accent: "teal",
  font: "inter",
  textSize: "md",
  showQuotes: true,
  alarmSound: "classic",
  alarmVolume: 0.7,
  notifyEnabled: false,
  notifyTimer: true,
  notifyBlocks: true,
  notifyBlockLead: 5,
  notifyDue: true,
  notifyDueTime: "09:00"
};

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
    showQuotes: flag(saved.showQuotes, DEFAULTS.showQuotes),
    alarmSound: pick(saved.alarmSound, ALARM_SOUNDS, DEFAULTS.alarmSound),
    alarmVolume: typeof saved.alarmVolume === "number" ? Math.min(1, Math.max(0, saved.alarmVolume)) : DEFAULTS.alarmVolume,
    notifyEnabled: flag(saved.notifyEnabled, DEFAULTS.notifyEnabled),
    notifyTimer: flag(saved.notifyTimer, DEFAULTS.notifyTimer),
    notifyBlocks: flag(saved.notifyBlocks, DEFAULTS.notifyBlocks),
    notifyBlockLead: BLOCK_LEADS.includes(saved.notifyBlockLead as number) ? saved.notifyBlockLead as number : DEFAULTS.notifyBlockLead,
    notifyDue: flag(saved.notifyDue, DEFAULTS.notifyDue),
    notifyDueTime: typeof saved.notifyDueTime === "string" && /^\d{2}:\d{2}$/.test(saved.notifyDueTime) ? saved.notifyDueTime : DEFAULTS.notifyDueTime
  };
}

export function initSettingsStore() {
  return {
    ...DEFAULTS,
    accents: ACCENTS,
    fonts: FONTS,
    textSizes: TEXT_SIZES,
    alarmSounds: ALARM_SOUNDS,
    blockLeads: BLOCK_LEADS,
    // The browser's answer to the notification prompt: "default", "granted", "denied", or "unsupported"
    notificationPermission: "default" as NotificationPermission | "unsupported",

    // Alpine calls init() when the store is registered
    init(): void {
      Object.assign(this, loadSettings());
      this.notificationPermission = permission();
      this.apply();
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
      this.update({ ...DEFAULTS, name: this.name, notifyEnabled: this.notifyEnabled });
    },

    save(): void {
      const saved = Object.fromEntries(Object.keys(DEFAULTS).map(key => [key, this[key as keyof Settings]]));
      localStorage.setItem("settings", JSON.stringify(saved));
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
    },

    playAlarm(sound: AlarmSound = this.alarmSound): void {
      playAlarmSound(sound, this.alarmVolume);
    }
  };
}
