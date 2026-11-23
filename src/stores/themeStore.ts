import { loadString, saveString } from '../lib/storage';

export type Theme = 'light' | 'dark';

interface ThemeStore {
    current: Theme;
    init: () => void;
    toggle: () => void;
    setTheme: (theme: Theme) => void;
    applyTheme: (theme: Theme) => void;
}

// The browser's UI color (the phone address bar, an installed app's title bar) follows
// the page color of the current theme. --bg-color in Layout.astro stays the only source.
function syncThemeColor(): void {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const color = getComputedStyle(document.documentElement).getPropertyValue('--bg-color').trim();
    if (meta && color) meta.content = color;
}

/**
 * Initialize the Alpine.js theme store
 * This should be the ONLY place where theme manipulation happens
 */
export function initThemeStore(): ThemeStore {
    return {
        current: 'light',

        init() {
            // The inline script in Layout.astro has already applied the initial theme
            this.current = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
            syncThemeColor();

            // Follow system preference changes only if the user hasn't picked a theme
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                if (!loadString('theme')) {
                    this.current = e.matches ? 'dark' : 'light';
                    this.applyTheme(this.current);
                }
            });
        },

        /**
         * Apply theme to DOM without updating store state
         */
        applyTheme(theme: Theme) {
            const root = document.documentElement;
            root.classList.add('theme-transition');
            root.setAttribute('data-theme', theme);
            root.classList.toggle('dark', theme === 'dark');
            syncThemeColor();
            setTimeout(() => root.classList.remove('theme-transition'), 150);
        },

        setTheme(theme: Theme) {
            this.current = theme;
            saveString('theme', theme);
            this.applyTheme(theme);
        },

        toggle() {
            this.setTheme(this.current === 'dark' ? 'light' : 'dark');
        }
    };
}
