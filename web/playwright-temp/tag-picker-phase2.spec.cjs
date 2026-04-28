const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const harnessUrl = pathToFileURL(
  path.join(__dirname, '..', 'dist-harness', 'tag-picker-harness.html'),
).href;

test.describe('phase 2 tag picker redesign', () => {
  test('shows frequent tags only while search is inactive', async ({ page }) => {
    await page.goto(harnessUrl);

    await page.getByRole('button', { name: '点击选择标签' }).click();

    await expect(page.getByLabel('标签搜索')).toBeVisible();
    await expect(page.getByLabel('常用标签区')).toBeVisible();
    await expect(page.getByLabel('常用标签区')).toContainText('买菜 / 早餐');
    await expect(page.getByLabel('全部标签列表')).toContainText('买菜 / 早餐');

    await page.getByLabel('标签搜索').fill('地铁');

    await expect(page.getByLabel('标签搜索')).toBeVisible();
    await expect(page.getByLabel('常用标签区')).toHaveCount(0);
    await expect(page.getByLabel('全部标签列表')).toContainText('交通 / 地铁');
  });

  test('keeps flat search results selectable and confirmable', async ({ page }) => {
    await page.goto(harnessUrl);

    await page.getByRole('button', { name: '点击选择标签' }).click();
    await page.getByLabel('标签搜索').fill('地铁');
    await page.getByRole('button', { name: '交通 / 地铁' }).click();
    await page.getByRole('button', { name: '确定' }).click();

    await expect(page.getByTestId('selected-tags')).toHaveText('subway');
    await expect(page.getByRole('button', { name: '交通 / 地铁' })).toBeVisible();
  });
});
