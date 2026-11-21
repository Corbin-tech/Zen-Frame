import { expect, type Page } from '@playwright/test';
import { areaOf, type ViewId } from '../src/lib/nav';

export async function openView(page: Page, id: ViewId) {
  await page.locator(`button[data-area="${areaOf(id).id}"]`).click();
  await page.locator(`button[data-tab="${id}"]`).click();
  await expect(page.locator(`button[data-tab="${id}"]`)).toHaveAttribute('aria-current', 'page');
}
