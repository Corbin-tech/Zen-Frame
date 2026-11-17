import JSConfetti from "js-confetti";
import { CONFETTI_TRIGGERS, type Milestone } from "../stores/settingsStore";

// Bigger milestones get a bigger burst
const PIECES: Record<Milestone, number> = { task: 60, cluster: 120, all: 200 };

// Accent shades (see src/styles/preferences.css) that show well on each theme's background
const SHADES = { light: [300, 400, 500, 600, 700], dark: [200, 300, 400, 500, 600] };

let confetti: JSConfetti | null = null;

interface CelebrationSettings {
  confetti: boolean;
  confettiTrigger: Milestone;
}

// The current accent as canvas colors. The CSS variables hold "R G B".
function accentColors(): string[] {
  const root = document.documentElement;
  const styles = getComputedStyle(root);
  const shades = root.classList.contains("dark") ? SHADES.dark : SHADES.light;
  return shades
    .map(shade => styles.getPropertyValue(`--accent-${shade}`).trim().split(/\s+/).join(", "))
    .filter(Boolean)
    .map(rgb => `rgb(${rgb})`);
}

// Fires a burst if Settings allows confetti for this milestone
export function celebrate(milestone: Milestone): void {
  const settings = window.Alpine?.store("settings") as CelebrationSettings | undefined;
  if (!settings?.confetti) return;
  const rank = (id: Milestone) => CONFETTI_TRIGGERS.findIndex(trigger => trigger.id === id);
  if (rank(milestone) < rank(settings.confettiTrigger)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // js-confetti times each piece from when it is made. If the pieces are made in the same
  // task as the completion, the first frame waits for the store update and the re-render,
  // so the burst starts part-way into its flight. Two frames let that update paint first.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    confetti ??= new JSConfetti();
    confetti.addConfetti({ confettiColors: accentColors(), confettiNumber: PIECES[milestone] });
  }));
}
