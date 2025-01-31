export type Theme = 'light' | 'dark';

interface ThemeStore {
    current: Theme;
    systemPreference: Theme;
    toggle: () => void;
    setTheme: (theme: Theme) => void;
    init: () => void;
}

export function initThemeStore(): void {
    if (typeof window === "undefined") return;
    
    const store = {
        current: 'light' as Theme,
        systemPreference: 'light' as Theme,

        init() {
            // Check for saved theme
            const savedTheme = localStorage.getItem('theme') as Theme | null;
            
            // Check system preference
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
            this.systemPreference = prefersDark.matches ? 'dark' : 'light';
            
            // Set initial theme
            this.current = savedTheme || this.systemPreference;
            this.setTheme(this.current);

            // Listen for system preference changes
            prefersDark.addEventListener('change', (e) => {
                this.systemPreference = e.matches ? 'dark' : 'light';
                if (!localStorage.getItem('theme')) {
                    this.setTheme(this.systemPreference);
                }
            });
        },

        setTheme(theme: Theme) {
            this.current = theme;
            localStorage.setItem('theme', theme);
            
            if (theme === 'dark') {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        },

        toggle() {
            this.current = this.current === 'dark' ? 'light' : 'dark';
            this.setTheme(this.current);
        }
    } as ThemeStore;

    window.Alpine.store('theme', store);
}
