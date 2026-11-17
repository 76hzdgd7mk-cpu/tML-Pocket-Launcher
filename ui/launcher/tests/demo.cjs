async function toggleDemo(page) {
  await page.locator('.topbar [data-action="page-help"]').click();
  await page.locator('#demo-toggle').click();
  await page.keyboard.press('Escape');
}
module.exports = { toggleDemo };
