const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const tagHarnessUrl = pathToFileURL(
  path.join(__dirname, '..', 'dist-harness', 'tag-picker-harness.html'),
).href;
const categoryHarnessUrl = pathToFileURL(
  path.join(__dirname, '..', 'dist-harness', 'category-picker-harness.html'),
).href;

test.describe('phase 3 selection completion flow', () => {
  test('keeps the tag completion bar collapsed by default, expandable, and closes on confirm', async ({ page }) => {
    await page.goto(tagHarnessUrl);

    await page.getByRole('button', { name: '点击选择标签' }).click();
    await page.getByRole('button', { name: '交通 / 地铁' }).click();
    await page.getByRole('button', { name: '买菜 / 早餐' }).click();

    await expect(page.getByLabel('标签完成栏')).toBeVisible();
    await expect(page.getByLabel('标签完成计数')).toHaveText('已选 2');
    await expect(page.getByLabel('已选标签列表')).toHaveCount(0);

    await page.getByRole('button', { name: '展开已选标签' }).click();

    await expect(page.getByLabel('已选标签列表')).toBeVisible();
    await expect(page.getByLabel('已选标签列表')).toContainText('交通 / 地铁');
    await expect(page.getByLabel('已选标签列表')).toContainText('买菜 / 早餐');

    await page.getByRole('button', { name: '确定' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('selected-tags')).toHaveText('subway,breakfast');
  });

  test('keeps category picker free of tag completion UI and auto-closes on final select', async ({ page }) => {
    await page.goto(categoryHarnessUrl);

    await page.getByRole('button', { name: '打开分类选择器' }).click();
    await page.getByRole('button', { name: '展开分类 餐饮' }).click();
    await page.getByRole('button', { name: '早餐' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByLabel('标签完成栏')).toHaveCount(0);
    await expect(page.getByText('当前已选')).toHaveCount(0);
    await expect(page.getByTestId('selected-value')).toHaveText('food-breakfast');
  });
});
