import { test, expect } from '@playwright/test';

for (const width of [320, 390, 1280]) {
  test(`Auto-plan availability controls stay inside card at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      if (sessionStorage.getItem('autoplan-mobile-seeded')) return;
      sessionStorage.setItem('autoplan-mobile-seeded', 'true');
      localStorage.clear();
      localStorage.setItem('activeTab', 'schedule');
    });
    await page.goto('/');

    const section = page.locator('section[x-data="autoPlan"]');
    await section.getByRole('button', { name: 'Add hours', exact: true }).click();

    const start = section.locator('select[name="plan-hours-start"]');
    const end = section.locator('select[name="plan-hours-end"]');
    const remove = section.getByRole('button', { name: 'Remove these hours', exact: true });
    await expect(remove).toBeVisible();

    const card = remove.locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]');
    const sectionBox = (await section.boundingBox())!;
    const cardBox = (await card.boundingBox())!;
    const cardPaddingRight = await card.evaluate(el => parseFloat(getComputedStyle(el).paddingRight));
    const cardContentRight = cardBox.x + cardBox.width - cardPaddingRight;

    expect(await card.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await section.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);

    for (const control of [start, end, remove]) {
      const box = (await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(cardBox.x);
      expect(box.x + box.width).toBeLessThanOrEqual(cardContentRight + 1);
      expect(box.x + box.width).toBeLessThanOrEqual(sectionBox.x + sectionBox.width);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }

    const startBox = (await start.boundingBox())!;
    const endBox = (await end.boundingBox())!;
    const removeBox = (await remove.boundingBox())!;
    expect(Math.abs((startBox.y + startBox.height / 2) - (endBox.y + endBox.height / 2))).toBeLessThan(2);
    if (width === 320) {
      expect(removeBox.y).toBeGreaterThanOrEqual(endBox.y + endBox.height - 1);
    } else {
      expect(Math.abs((removeBox.y + removeBox.height / 2) - (startBox.y + startBox.height / 2))).toBeLessThan(2);
    }

    await remove.click();
    await expect(remove).toHaveCount(0);
  });
}

test('Auto-plan time selects keep AM/PM readable at 330px with Mono font', async ({ page }) => {
  await page.setViewportSize({ width: 330, height: 900 });
  await page.addInitScript(() => {
    if (sessionStorage.getItem('autoplan-mono-seeded')) return;
    sessionStorage.setItem('autoplan-mono-seeded', 'true');
    localStorage.clear();
    localStorage.setItem('activeTab', 'schedule');
    localStorage.setItem('settings', JSON.stringify({ font: 'mono' }));
    localStorage.setItem('planning', JSON.stringify({
      duration: 30,
      gap: 0,
      availability: [{ id: 'w1', weekdays: [1, 2, 3, 4, 5], start: 10 * 60, end: 22 * 60 }],
    }));
  });
  await page.goto('/');

  const section = page.locator('section[x-data="autoPlan"]');
  await section.getByRole('button', { name: 'Auto-plan', exact: true }).click();
  await section.getByRole('button', { name: 'Edit hours', exact: true }).click();

  const start = section.locator('select[name="plan-hours-start"]');
  const end = section.locator('select[name="plan-hours-end"]');
  await expect(start).toBeVisible();

  for (const select of [start, end]) {
    const fits = await select.evaluate((el: HTMLSelectElement) => {
      const style = getComputedStyle(el);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const label = el.selectedOptions[0]?.textContent ?? '';
      const available = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return available >= ctx.measureText(label).width;
    });
    expect(fits).toBe(true);
  }
});
