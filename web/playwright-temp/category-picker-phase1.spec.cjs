const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const harnessUrl = pathToFileURL(
  path.join(__dirname, '..', 'dist-harness', 'category-picker-harness.html'),
).href;

test.describe('phase 1 category picker redesign', () => {
  test('top-level category taps expand instead of selecting immediately', async ({ page }) => {
    await page.goto(harnessUrl);

    await expect(page.getByTestId('selected-value')).toHaveText('未选择');
    await expect(page.getByLabel('顶级分类网格')).toBeVisible();
    await expect(page.getByRole('button', { name: '展开分类 餐饮' })).toContainText('餐饮');

    await page.getByRole('button', { name: '展开分类 餐饮' }).click();

    await expect(page.getByTestId('selected-value')).toHaveText('未选择');
    await expect(page.getByLabel('展开分类视图')).toBeVisible();
    await expect(page.getByLabel('顶级分类网格')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '返回顶级分类' })).toBeVisible();
  });

  test('expanded view replaces grid and back preserves expanded context', async ({ page }) => {
    await page.goto(harnessUrl);

    await page.getByRole('button', { name: '展开分类 交通' }).click();
    await page.getByRole('button', { name: '返回顶级分类' }).click();

    const transportTile = page.getByRole('button', { name: '展开分类 交通' });
    await expect(page.getByLabel('顶级分类网格')).toBeVisible();
    await expect(transportTile).toContainText('上次展开');

    await transportTile.click();
    await page.getByRole('button', { name: '地铁' }).click();
    await expect(page.getByTestId('selected-value')).toHaveText('transport-subway');
  });
});
