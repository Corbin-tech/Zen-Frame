// The browser-tab icon: the ensō from public/favicon.svg, redrawn in the chosen accent.
// The tile uses --accent-600, the button step and the same step as the logo in the top bar.
// For the default Teal that is #036672, the color in public/favicon.svg.

const ENSO = (fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
  `<rect width="32" height="32" rx="9" fill="${fill}"/>` +
  `<path d="M21.5 8.2A9.2 9.2 0 1 0 24.9 13.8" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>` +
  `<circle cx="21.5" cy="8.2" r="2.1" fill="#fff"/>` +
  `</svg>`;

// "3 102 114" (an --accent-* value) to "#036672"; null when it isn't three channels
function channelsToHex(value: string): string | null {
  const parts = value.trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return `#${parts.map(n => n.toString(16).padStart(2, "0")).join("")}`;
}

let lastFill = "";

// Call after data-accent changes on <html>. Reads the color from CSS so preferences.css stays the only source.
export function applyAccentFavicon(): void {
  const fill = channelsToHex(getComputedStyle(document.documentElement).getPropertyValue("--accent-600"));
  if (!fill || fill === lastFill) return;
  lastFill = fill;

  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.append(link);
  }
  link.type = "image/svg+xml";
  link.href = `data:image/svg+xml,${encodeURIComponent(ENSO(fill))}`;
}
