// The browser-tab icon: the ensō from public/favicon.svg, redrawn in the chosen accent.
// The tile uses --accent-600, the button step. For the default Teal that is #036672,
// the color in public/favicon.svg.

// The refined ensō on a 32 x 32 grid: an open circle (radius 9.5, centered) with its gap at
// the top right, from 26° to 105° clockwise from the top, and one distinct dot in the gap.
// EnsoMark.astro draws the same shape. public/favicon.svg and the PNG icons in public/ copy it.
export const ENSO_ARC = "M25.18 18.46A9.5 9.5 0 1 1 20.16 7.46";
export const ENSO_DOT = { cx: 24.64, cy: 12.06 };

// A heavier stroke than the in-app mark, so the shape holds at 16 px
const ENSO = (fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
  `<rect width="32" height="32" rx="9" fill="${fill}"/>` +
  `<path d="${ENSO_ARC}" fill="none" stroke="#F7F5EF" stroke-width="2.6" stroke-linecap="round"/>` +
  `<circle cx="${ENSO_DOT.cx}" cy="${ENSO_DOT.cy}" r="1.7" fill="#F7F5EF"/>` +
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
