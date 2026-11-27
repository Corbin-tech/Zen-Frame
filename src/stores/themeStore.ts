import { loadString, saveString } from '../lib/storage';

export type Theme = 'light' | 'dark';

type ThemeTarget = { button: HTMLButtonElement; bounds: DOMRect };

interface ThemeStore {
    current: Theme;
    init: () => void;
    toggle: () => void;
    setTheme: (theme: Theme) => void;
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
    let requested: Theme = 'light';
    let switching = false;
    let themeTargets: ThemeTarget[] = [];
    let pressedTarget: ThemeTarget | undefined;

    function containsPoint({ bounds }: ThemeTarget, { clientX: x, clientY: y }: MouseEvent) {
        return x >= bounds.left && x < bounds.right && y >= bounds.top && y < bounds.bottom;
    }

    async function applyTheme(store: ThemeStore) {
        const root = document.documentElement;
        root.classList.add('theme-switching');
        try {
            store.current = requested;
            root.setAttribute('data-theme', store.current);
            root.classList.toggle('dark', store.current === 'dark');
            syncThemeColor();
            // Let Alpine apply theme-dependent bindings before the browser resolves styles.
            await Promise.resolve();
            root.getBoundingClientRect();
        } finally {
            root.classList.remove('theme-switching');
        }
    }

    function switchTheme(store: ThemeStore) {
        if (switching || requested === store.current) return;
        if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            void applyTheme(store);
            return;
        }

        // Finish the visible crossfade before reversing it; skipping it would snap to its end.
        switching = true;
        themeTargets = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-theme-control]')).flatMap(button => {
            const bounds = button.getBoundingClientRect();
            const center = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
            return button.contains(center) ? [{ button, bounds }] : [];
        });
        function finish() {
            switching = false;
            themeTargets = [];
            switchTheme(store);
        }
        try {
            const transition = document.startViewTransition(() => applyTheme(store));
            void transition.ready.catch(() => {});
            void transition.finished.then(finish, finish);
        } catch {
            switching = false;
            themeTargets = [];
            void applyTheme(store);
        }
    }

    return {
        current: 'light',

        init() {
            // The inline script in Layout.astro has already applied the initial theme
            requested = this.current = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
            syncThemeColor();

            const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

            // Captured elements aren't hit-testable. Keep the theme controls shown in the snapshot usable.
            document.addEventListener('pointerdown', (event) => {
                if (!event.isPrimary) return;
                pressedTarget = switching && event.target === document.documentElement && event.button === 0
                    ? themeTargets.find(target => containsPoint(target, event))
                    : undefined;
            });
            document.addEventListener('pointercancel', (event) => {
                if (event.isPrimary) pressedTarget = undefined;
            });
            document.addEventListener('click', (event) => {
                if (!event.detail) return;
                const pressed = pressedTarget;
                pressedTarget = undefined;
                if (event.target !== document.documentElement) return;
                const clicked = pressed
                    ? (containsPoint(pressed, event) ? pressed : undefined)
                    : themeTargets.find(target => containsPoint(target, event));
                clicked?.button.click();
            });

            // Follow system preference changes only if the user hasn't picked a theme
            darkQuery.addEventListener('change', (e) => {
                if (!loadString('theme')) {
                    requested = e.matches ? 'dark' : 'light';
                    switchTheme(this);
                }
            });

            window.addEventListener('storage', (event) => {
                if (event.storageArea !== localStorage || (event.key !== null && event.key !== 'theme')) return;
                const saved = loadString('theme');
                requested = saved === 'light' || saved === 'dark' ? saved : (darkQuery.matches ? 'dark' : 'light');
                switchTheme(this);
            });
        },

        setTheme(theme: Theme) {
            requested = theme;
            saveString('theme', theme);
            switchTheme(this);
        },

        toggle() {
            this.setTheme(requested === 'dark' ? 'light' : 'dark');
        }
    };
}
