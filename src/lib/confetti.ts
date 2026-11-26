import { CONFETTI_TRIGGERS, type Milestone } from "../stores/settingsStore";

// A burst of confetti on a canvas of our own, instead of js-confetti: that library re-fixed the
// canvas size (getComputedStyle, width/height setAttribute, offsetHeight) on every animation
// frame, reallocating the GPU backing buffer and forcing layout through the whole burst. Here
// the canvas is sized once per burst, only a window resize can size it again, and the loop
// stops entirely between bursts. A "zen-confetti" window event tells ZenBackdrop to hold still.

// Bigger milestones get a bigger burst
const PIECES: Record<Milestone, number> = { task: 40, cluster: 80, all: 130 };

// Accent shades (see src/styles/preferences.css) that show well on each theme's background
const SHADES = { light: [300, 400, 500, 600, 700], dark: [200, 300, 400, 500, 600] };

// Warmth from tailwind.config.mjs: the base gold, with warmth-deep on light and warmth-light on dark
const WARMTH = { light: ["#D7B36A", "#9C7A2E"], dark: ["#D7B36A", "#E2C382"] };

// Flight tuning in px and ms, carried over from js-confetti so bursts keep their look: launched
// from the lower left and right corners, arcing up and over, tumbling as they flutter down.
const RADIUS = 6;               // Piece half-width; its half-height flips between 0 and RADIUS
const GRAVITY = 0.00125;        // px per ms^2
const LAUNCH = [0.9, 1.7];      // px per ms, before the per-screen scale below
const GLIDE = [0.2, 0.6];       // The horizontal speed a piece settles toward
const DRAG = [0.0005, 0.0009];  // How fast it sheds that speed, per ms
const FLIP = [0.03, 0.07];      // The tumble's rate, in half-height per ms
const SPREAD = 150;             // px back along its flight line that a piece starts within
const CANNON_Y = 5 / 7;        // The launch height, as a share of the screen
const HD_WIDTH = 1920;          // Wide screens fly faster, so bursts cross the same view
const GONE_BELOW = 100;         // px under the bottom edge where a piece is dropped

interface Piece {
  x: number;
  y: number;
  baseY: number;      // The cannon line: y = baseY - rise * age + GRAVITY * age^2 / 2
  rise: number;       // px per ms, straight up before gravity eats it
  drift: number;      // px per ms of forward speed, still being damped toward glide
  glide: number;
  drag: number;
  sinX: number;       // The flight line's horizontal share; negative for right-side launches
  tumble: number;     // Current half-height, between 0 and RADIUS
  tumbleRate: number;
  tumbleDir: 1 | -1;
  tilt: number;
  born: number;       // ms, the same clock as requestAnimationFrame
  shade: number;
}

// The canvas lives only while pieces are in flight, and holds one size for the whole burst
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let shades: string[] = [];
let pieces: Piece[] = [];
let width = 0;  // CSS pixels
let height = 0;
let lastMs = 0;
let running = false;

interface CelebrationSettings {
  confetti: boolean;
  confettiTrigger: Milestone;
}

// The current accent as canvas colors, plus Warmth. The CSS variables hold "R G B".
function burstColors(): string[] {
  const root = document.documentElement;
  const styles = getComputedStyle(root);
  const theme = root.classList.contains("dark") ? "dark" : "light";
  return SHADES[theme]
    .map(shade => styles.getPropertyValue(`--accent-${shade}`).trim().split(/\s+/).join(", "))
    .filter(Boolean)
    .map(rgb => `rgb(${rgb})`)
    .concat(WARMTH[theme]);
}

function sizeCanvas(): void {
  if (!canvas || !ctx) return;
  const dpr = window.devicePixelRatio || 1;
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function makePiece(index: number): Piece {
  const fromLeft = index % 2 === 0;
  const degrees = 15 + Math.random() * 67; // 15 to 82 degrees off straight up
  const angle = (fromLeft ? degrees : -degrees) * Math.PI / 180;
  const scale = Math.log(Math.max(width, 1)) / Math.log(HD_WIDTH);
  const speed = LAUNCH[0] + Math.random() * (LAUNCH[1] - LAUNCH[0]);
  const spread = -Math.random() * SPREAD;
  const baseY = height * CANNON_Y - spread * Math.cos(angle);
  return {
    x: (fromLeft ? 0 : width) + spread * Math.sin(angle),
    y: baseY,
    baseY,
    rise: speed * scale * Math.cos(angle),
    drift: speed * scale,
    glide: GLIDE[0] + Math.random() * (GLIDE[1] - GLIDE[0]),
    drag: DRAG[0] + Math.random() * (DRAG[1] - DRAG[0]),
    sinX: Math.sin(angle),
    tumble: RADIUS,
    tumbleRate: (FLIP[0] + Math.random() * (FLIP[1] - FLIP[0])) * scale,
    tumbleDir: -1,
    tilt: (fromLeft ? 1 : -1) * Math.random() * 0.2,
    born: performance.now(),
    shade: index % shades.length
  };
}

function step(now: number): void {
  if (!canvas || !ctx) return;
  const delta = Math.min(50, Math.max(0, now - lastMs));
  lastMs = now;
  ctx.clearRect(0, 0, width, height);

  const alive: Piece[] = [];
  for (const piece of pieces) {
    const age = now - piece.born;
    if (piece.drift > piece.glide) piece.drift -= piece.drag * delta;
    piece.x += piece.drift * piece.sinX * delta;
    piece.y = piece.baseY - piece.rise * age + (GRAVITY * age * age) / 2;
    piece.tumbleRate = Math.max(0, piece.tumbleRate - 0.00001 * delta);
    if (piece.tumbleDir < 0) {
      piece.tumble -= delta * piece.tumbleRate;
      if (piece.tumble <= 0) { piece.tumble = 0; piece.tumbleDir = 1; }
    } else {
      piece.tumble += delta * piece.tumbleRate;
      if (piece.tumble >= RADIUS) { piece.tumble = RADIUS; piece.tumbleDir = -1; }
    }
    if (piece.y <= height + GONE_BELOW) alive.push(piece);
  }
  pieces = alive;

  // One path per shade, so the whole burst fills in shades.length ctx.fill() calls
  for (let shade = 0; shade < shades.length; shade++) {
    let drew = false;
    ctx.fillStyle = shades[shade];
    ctx.beginPath();
    for (const piece of pieces) {
      if (piece.shade !== shade) continue;
      drew = true;
      ctx.moveTo(piece.x, piece.y);
      ctx.ellipse(piece.x, piece.y, RADIUS, piece.tumble, piece.tilt, 0, Math.PI * 2);
    }
    if (drew) ctx.fill();
  }

  if (pieces.length) {
    requestAnimationFrame(step);
  } else {
    ctx.clearRect(0, 0, width, height);
    window.removeEventListener("resize", sizeCanvas);
    canvas.remove();
    canvas = null;
    ctx = null;
    running = false;
    window.dispatchEvent(new CustomEvent("zen-confetti", { detail: { active: false } }));
  }
}

// Fires a burst if Settings allows confetti for this milestone
export function celebrate(milestone: Milestone): void {
  const settings = window.Alpine?.store("settings") as CelebrationSettings | undefined;
  if (!settings?.confetti) return;
  const rank = (id: Milestone) => CONFETTI_TRIGGERS.findIndex(trigger => trigger.id === id);
  if (rank(milestone) < rank(settings.confettiTrigger)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // Two frames let the completion's store update and re-render paint before the burst begins,
  // so the first pieces fly on a frame that is not still doing bookkeeping for the click.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    shades = burstColors();
    if (!canvas && !ctx) {
      canvas = document.createElement("canvas");
      canvas.style.cssText = "position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1000;";
      ctx = canvas.getContext("2d");
      if (!ctx) { canvas.remove(); canvas = null; return; }
      document.body.appendChild(canvas);
      sizeCanvas();
      window.addEventListener("resize", sizeCanvas);
      window.dispatchEvent(new CustomEvent("zen-confetti", { detail: { active: true } }));
    }
    // Snapshot the count first: pieces.length grows with every push, and makePiece's index
    // alternates the launch side, so each piece needs its own sequential number
    const firstIndex = pieces.length;
    for (let i = 0; i < PIECES[milestone]; i++) pieces.push(makePiece(firstIndex + i));
    if (!running) {
      running = true;
      lastMs = performance.now();
      requestAnimationFrame(step);
    }
  }));
}
