// Define initialTheme on window for TypeScript
declare global {
    interface Window {
        initialTheme?: 'light' | 'dark';
    }
}

export type Theme = 'light' | 'dark';

interface ThemeStore {
    current: Theme;
    systemPreference: Theme;
    toggle: () => void;
    setTheme: (theme: Theme) => void;
    applyTheme: (theme: Theme, withTransition?: boolean) => void;
    init: () => void;
}

/**
 * Initialize the Alpine.js theme store
 * This should be the ONLY place where theme manipulation happens
 */
export function initThemeStore(): ThemeStore {
    if (typeof window === "undefined") {
        // Return a dummy store for SSR
        return {} as ThemeStore;
    }
    
    const store = {
        current: 'light' as Theme,
        systemPreference: 'light' as Theme,

        init() {
            // Check for saved theme
            const savedTheme = localStorage.getItem('theme') as Theme | null;
            
            // Check system preference
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
            this.systemPreference = prefersDark.matches ? 'dark' : 'light';
            
            // Use initialTheme if available (set by inline script in Layout.astro)
            // This avoids redundant DOM operations and ensures consistency
            if (window.initialTheme) {
                this.current = window.initialTheme;
            } else {
                // Fallback to original logic
                this.current = savedTheme || this.systemPreference;
                
                // Apply the theme if not already applied by inline script
                const isDarkMode = document.documentElement.classList.contains('dark');
                if ((this.current === 'dark' && !isDarkMode) || (this.current === 'light' && isDarkMode)) {
                    this.applyTheme(this.current, false); // Apply without transitions on init
                }
            }

            // Listen for system preference changes
            prefersDark.addEventListener('change', (e) => {
                this.systemPreference = e.matches ? 'dark' : 'light';
                // Only auto-switch if user hasn't set a preference
                if (!localStorage.getItem('theme')) {
                    this.setTheme(this.systemPreference);
                }
            });
        },

        /**
         * Apply theme to DOM without updating store state
         * Used internally by setTheme and init
         */
        applyTheme(theme: Theme, withTransition = true) {
            if (withTransition) {
                // Add transition class before changing theme
                document.documentElement.classList.add('theme-transition');
            }
            
            // Set data-theme attribute for CSS targeting
            document.documentElement.setAttribute('data-theme', theme);
            
            // Update class based on theme
            if (theme === 'dark') {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
            
            if (withTransition) {
                // Remove transition class after transitions complete - use a shorter duration
                setTimeout(() => {
                    document.documentElement.classList.remove('theme-transition');
                }, 150);
            }
        },

        /**
         * Set theme - updates store state and applies theme to DOM
         */
        setTheme(theme: Theme) {
            this.current = theme;
            localStorage.setItem('theme', theme);
            this.applyTheme(theme, true);
        },

        /**
         * Toggle between light and dark themes
         */
        toggle() {
            const newTheme = this.current === 'dark' ? 'light' : 'dark';
            this.setTheme(newTheme);
        }
    } as ThemeStore;
    
    return store;
}
