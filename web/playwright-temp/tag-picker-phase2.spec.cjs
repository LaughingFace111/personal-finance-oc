const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const harnessUrl = pathToFileURL(
  path.join(__dirname, '..', 'dist-harness', 'tag-picker-harness.html'),
).href;

test.describe('phase 2 tag picker bug-fix pass', () => {
  test('shows default-expanded grouped sections with concise child labels and collapsible headers', async ({ page }) => {
    await page.goto(harnessUrl);

    await page.getByRole('button', { name: '点击选择标签' }).click();

    const transportGroup = page.getByRole('button', { name: '交通分组' });
    await expect(transportGroup).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', { name: '地铁' })).toBeVisible();
    await expect(page.getByLabel('全部标签列表')).not.toContainText('交通 / 地铁');

    await transportGroup.click();
    await expect(transportGroup).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('button', { name: '地铁' })).toHaveCount(0);

    await transportGroup.click();
    await expect(transportGroup).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', { name: '地铁' })).toBeVisible();
  });

  test('renders child tags with the top-level parent color and preserves hierarchy labels after confirm', async ({ page }) => {
    await page.goto(harnessUrl);

    await page.getByRole('button', { name: '点击选择标签' }).click();

    const subwayTag = page.getByRole('button', { name: '地铁' });
    await expect(subwayTag).toBeVisible();
    await expect(subwayTag).toHaveCSS('border-color', 'rgba(37, 99, 235, 0.32)');

    await subwayTag.click();
    await page.getByRole('button', { name: '确定' }).click();

    await expect(page.getByTestId('selected-tags')).toHaveText('subway');
    await expect(page.getByRole('button', { name: '交通 / 地铁' })).toBeVisible();
  });

  test('clears search and restores full grouped browsing after creating a tag', async ({ page }) => {
    await page.goto(harnessUrl);

    await page.getByRole('button', { name: '点击选择标签' }).click();
    await page.getByLabel('标签搜索').fill('宵夜');
    await expect(page.getByLabel('全部标签列表')).toContainText('没有匹配的标签');

    await page.getByRole('button', { name: '[+ 新建标签]' }).click();
    await page.getByPlaceholder('输入标签名称，按 Enter 继续').fill('宵夜');
    await page.getByPlaceholder('输入标签名称，按 Enter 继续').press('Enter');

    await page.getByPlaceholder('请输入标签名称').fill('宵夜');
    await page.getByRole('combobox').click();
    await page.getByText('买菜', { exact: true }).click();
    await page.getByRole('button', { name: '创建并选中' }).click();

    await expect(page.getByLabel('标签搜索')).toHaveValue('');
    await expect(page.getByRole('button', { name: '买菜分组' })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', { name: '宵夜' })).toBeVisible();
    await expect(page.getByLabel('常用标签区')).toBeVisible();
  });
});
