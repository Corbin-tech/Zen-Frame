import { test, expect, type Page } from '@playwright/test';
import { openView } from './nav';

// Red is only for destructive actions, and secondary text stays at WCAG AA 4.5:1 in dark mode.

async function seed(page: Page, theme: 'light' | 'dark') {
  await page.clock.setFixedTime(new Date(2026, 10, 22, 12));
  await page.addInitScript((theme) => {
    if (sessionStorage.getItem('calm-color-seeded')) return;
    sessionStorage.setItem('calm-color-seeded', 'true');
    localStorage.clear();
    localStorage.setItem('theme', theme);
    localStorage.setItem('todos', JSON.stringify([
      { id: 'c1', todo: 'Biology', isCluster: true, completed: false, isPinned: false, parentId: null, createdAt: '2026-11-01T09:00:00.000Z' },
      { id: 't2', todo: 'Lab write-up', isCluster: false, completed: true, isPinned: false, parentId: 'c1', createdAt: '2026-11-01T09:00:00.000Z', completedAt: '2026-11-22T10:00:00.000Z' }
    ]));
    localStorage.setItem('activeTab', 'dashboard');
  }, theme);
  await page.goto('/');
}

for (const theme of ['light', 'dark'] as const) {
  test(`the Schedule current-time line uses the accent, not red, in ${theme} mode`, async ({ page }) => {
    await seed(page, theme);
    await openView(page, 'schedule');
    const line = page.locator('[data-now-line] > div').filter({ visible: true });
    await expect(line).toBeVisible();
    const colors = await line.evaluate(el => {
      const probe = document.createElement('span');
      probe.style.color = `rgb(${getComputedStyle(document.documentElement).getPropertyValue(document.documentElement.classList.contains('dark') ? '--accent-400' : '--accent-600').trim()})`;
      document.body.append(probe);
      const accent = getComputedStyle(probe).color;
      probe.remove();
      return { line: getComputedStyle(el).backgroundColor, dot: getComputedStyle(el.firstElementChild!).backgroundColor, accent };
    });
    expect(colors.line).toBe(colors.accent);
    expect(colors.dot).toBe(colors.accent);
    expect(colors.line).not.toBe('rgb(244, 63, 94)'); // rose-500
  });
}

test('cluster secondary actions meet 4.5:1 on the dark cluster surface', async ({ page }) => {
  await seed(page, 'dark');
  await openView(page, 'taskmanager');
  for (const name of ['Add a task to Biology', 'Completed (1)']) {
    const control = page.getByRole('button', { name }).filter({ visible: true }).first();
    const ratio = await control.evaluate(el => {
      const rgb = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
      const lum = ([r, g, b]: number[]) => {
        const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      let surface: Element | null = el;
      while (surface && getComputedStyle(surface).backgroundColor === 'rgba(0, 0, 0, 0)') surface = surface.parentElement;
      const [a, b] = [lum(rgb(getComputedStyle(el).color)), lum(rgb(getComputedStyle(surface!).backgroundColor))].sort((x, y) => y - x);
      return (a + 0.05) / (b + 0.05);
    });
    expect(ratio, name).toBeGreaterThanOrEqual(4.5);
  }
});
