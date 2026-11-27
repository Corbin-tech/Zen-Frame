import { test, expect } from '@playwright/test';

async function getFooterLinkMetrics(page: import('@playwright/test').Page) {
  const footer = page.getByRole('contentinfo');
  await footer.scrollIntoViewIfNeeded();
  return footer.locator('ul li > *').evaluateAll((els) =>
    els.map((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        text: el.textContent?.trim() ?? '',
        left: rect.left,
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        paddingTop: parseFloat(style.paddingTop),
        paddingBottom: parseFloat(style.paddingBottom),
      };
    }),
  );
}

test('footer columns align and Roadmap matches sibling link targets on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });

  for (const path of ['/', '/roadmap']) {
    await page.goto(path);
    const items = await getFooterLinkMetrics(page);
    expect(items.map((i) => i.text)).toContain('Roadmap');

    const reference = items.find((i) => i.text === 'Calm design principles')!;
    const roadmap = items.find((i) => i.text === 'Roadmap')!;
    const today = items.find((i) => i.text === 'Today')!;
    expect(reference).toBeDefined();
    expect(roadmap).toBeDefined();
    expect(Math.abs(today.top - reference.top), `${path}: column starts`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(roadmap.left - reference.left), `${path}: Roadmap column`).toBeLessThanOrEqual(0.5);
    expect(roadmap.top - reference.bottom, `${path}: Roadmap next row`).toBeCloseTo(0, 0);

    for (const item of items) {
      expect(Math.abs(item.height - reference.height), `${path}: ${item.text} height`).toBeLessThanOrEqual(0.5);
      expect(item.paddingTop, `${path}: ${item.text} paddingTop`).toBe(reference.paddingTop);
      expect(item.paddingBottom, `${path}: ${item.text} paddingBottom`).toBe(reference.paddingBottom);
    }
  }
});

test('footer Roadmap link matches sibling height and row alignment on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const items = await getFooterLinkMetrics(page);
  const principles = items.find((i) => i.text === 'Calm design principles')!;
  const roadmap = items.find((i) => i.text === 'Roadmap')!;
  expect(principles).toBeDefined();
  expect(roadmap).toBeDefined();

  for (const item of items) {
    expect(item.height, `${item.text} touch-target height`).toBeGreaterThanOrEqual(44);
    expect(Math.abs(item.height - principles.height), `${item.text} height`).toBeLessThanOrEqual(0.5);
    expect(item.paddingTop, `${item.text} paddingTop`).toBe(principles.paddingTop);
    expect(item.paddingBottom, `${item.text} paddingBottom`).toBe(principles.paddingBottom);
  }

  // Calm design principles and Roadmap share a row at 390px and should align vertically
  if (Math.abs(roadmap.top - principles.top) < principles.height / 2) {
    expect(Math.abs(roadmap.top - principles.top)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(roadmap.bottom - principles.bottom)).toBeLessThanOrEqual(0.5);
  }
});

test('all footer controls keep 44px targets with small text on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  await page.locator('html').evaluate((el) => { el.dataset.textSize = 'sm'; });
  const controls = await page.getByRole('contentinfo').locator('a, button').evaluateAll((els) =>
    els.map((el) => ({ name: el.textContent?.trim(), width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })),
  );
  for (const control of controls) {
    expect(control.width, `${control.name}: width`).toBeGreaterThanOrEqual(44);
    expect(control.height, `${control.name}: height`).toBeGreaterThanOrEqual(44);
  }
});
