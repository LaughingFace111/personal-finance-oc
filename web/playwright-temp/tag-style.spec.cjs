const { test, expect, request } = require('@playwright/test');
const fs = require('fs');

const API_URL = 'http://127.0.0.1:8000';
const USERNAME = 'codex_tag_test';
const PASSWORD = 'test123456';
const MOCK_PARSE_ID = 'mock-tag-style';

async function login() {
  const context = await request.newContext({ baseURL: API_URL });
  const res = await context.post('/api/auth/login', { data: { username: USERNAME, password: PASSWORD } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  await context.dispose();
  return json;
}

async function openWithAuth(page, path, token, parseMock = false) {
  if (parseMock) {
    await page.route(`**/api/bills/parse/${MOCK_PARSE_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          parseId: MOCK_PARSE_ID,
          items: [
            {
              tempId: 'row-1',
              billDate: '2026-04-18T00:00:00',
              direction: 'out',
              amount: 18.5,
              rawAccountName: '零钱',
              matchedAccountId: null,
              matchedAccountName: null,
              accountMatchStatus: 'UNMATCHED',
              tradeCategory: '餐饮',
              categoryId: null,
              categoryName: null,
              categoryMatchStatus: 'UNMATCHED',
              counterparty: '测试商户',
              counterpartyAccount: null,
              itemDesc: '拿铁咖啡',
              orderNo: 'WX-TAG-001',
              merchantOrderNo: null,
              tradeStatus: '支付成功',
              rawDirection: '支出',
              operatorNickname: null,
              operatorName: null,
              tags: [],
              unresolvedReason: '账户未匹配；分类未匹配',
              warnings: [],
            },
          ],
          metadata: { availableOperatorNames: [] },
        }),
      });
    });
  }

  await page.addInitScript((value) => {
    localStorage.setItem('token', value);
  }, token);
  await page.goto(path, { waitUntil: 'networkidle' });
}

async function selectOneTagAndCapture(page, screenshotName) {
  const triggerText = page.getByText('搜索、选择或创建标签').first();
  await expect(triggerText).toBeVisible();
  const trigger = triggerText.locator('xpath=ancestor::div[@role="button"][1]');
  await expect(trigger).toBeVisible();

  await trigger.click();
  await expect(page.getByRole('dialog').getByText('选择标签')).toBeVisible();
  const tagOption = page.getByRole('dialog').getByRole('button', { name: '早餐' }).first();
  await expect(tagOption).toBeVisible();
  await tagOption.click();
  await page.getByRole('button', { name: '确定' }).click();

  const selectedTag = trigger.getByText('早餐').first();
  await expect(selectedTag).toBeVisible();
  await trigger.screenshot({ path: `/tmp/tag-style-shots/${screenshotName}` });

  return await trigger.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      borderRadius: style.borderRadius,
      backgroundColor: style.backgroundColor,
      borderTopColor: style.borderTopColor,
      borderTopWidth: style.borderTopWidth,
      paddingTop: style.paddingTop,
      paddingRight: style.paddingRight,
      paddingBottom: style.paddingBottom,
      paddingLeft: style.paddingLeft,
    };
  });
}

test('tag selectors use TagMultiSelect consistently', async ({ page }) => {
  const auth = await login();
  const token = auth.access_token;

  const pages = [
    { key: 'transactions-new', path: '/transactions/new', mock: false },
    { key: 'add-transaction', path: '/add-transaction', mock: false },
    { key: 'transfer', path: '/transfer', mock: false },
    { key: 'imports', path: `/imports?parseId=${MOCK_PARSE_ID}`, mock: true },
  ];

  const styles = {};

  for (const item of pages) {
    await openWithAuth(page, item.path, token, item.mock);
    await expect(page.getByText('点击选择标签')).toHaveCount(0);
    await expect(page.getByText('请选择标签')).toHaveCount(0);
    styles[item.key] = await selectOneTagAndCapture(page, `${item.key}.png`);
  }

  const baseline = JSON.stringify(styles['add-transaction']);
  for (const [key, value] of Object.entries(styles)) {
    expect(JSON.stringify(value), `${key} style mismatch`).toBe(baseline);
  }

  fs.writeFileSync('/tmp/tag-style-shots/result.json', JSON.stringify(styles, null, 2));
});
