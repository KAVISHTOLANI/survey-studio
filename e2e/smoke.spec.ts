import { expect, test } from '@playwright/test';
import { checkMobile, snap } from './helpers';

test('build, take and read a survey', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ask better questions');
  await expect(page.locator('.hero .hbars').first()).toBeVisible();
  await page.waitForTimeout(1000);
  await snap(page, 'landing');
  await checkMobile(page, 'landing-mobile');

  await page.getByRole('link', { name: 'Open your surveys' }).click();
  await page.getByLabel('New survey title').fill('Team lunch');
  await page.getByRole('button', { name: 'Create survey' }).click();
  await page.getByRole('button', { name: '+ Yes / No' }).click();
  await page.getByLabel('Question 2 text').fill('Any dietary needs?');
  await page.getByRole('button', { name: 'Open for responses' }).click();
  await expect(page.getByText('Survey is open for responses.')).toBeVisible();
  await snap(page, 'builder');

  await page.getByRole('link', { name: 'Preview' }).click();
  await page.getByRole('radiogroup', { name: 'How satisfied are you overall?' }).getByText('5', { exact: true }).click();
  await page.getByLabel('No', { exact: true }).check();
  await snap(page, 'take');
  await checkMobile(page, 'take-mobile');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Thank you — response saved')).toBeVisible();
  await page.getByRole('link', { name: 'See results' }).click();
  await expect(page.getByText('5', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText(/1 response/)).toBeVisible();

  await page.goto('./#/survey/demo-workshop/results');
  await page.waitForTimeout(900);
  await snap(page, 'results');
  await checkMobile(page);
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  expect((await dl).suggestedFilename()).toBe('workshop-feedback-responses.csv');
});
