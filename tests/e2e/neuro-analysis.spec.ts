import { expect, test, type Page } from "@playwright/test";

const email = process.env.NEURO_E2E_EMAIL;
const password = process.env.NEURO_E2E_PASSWORD;

async function signInToNeuro(page: Page) {
  await page.goto("/signin?next=/neuro-analysis");
  await page.locator("#signin-email").fill(email ?? "");
  await page.locator("#signin-password").fill(password ?? "");
  await page.getByRole("button", { name: /log in|signing in/i }).click();
  await page.waitForURL(/\/neuro-analysis(?:\?|$)/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Neuro Analysis Investment Portal" })).toBeVisible({ timeout: 20_000 });
}

function collectBrowserFailures(page: Page) {
  const critical: string[] = [];
  const network: string[] = [];
  page.on("pageerror", (error) => critical.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") network.push(`console: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      const detail = `response: ${response.status()} ${response.url()}`;
      network.push(detail);
      if (response.url().includes("/api/neuro-analysis/") || response.url().includes("/api/smart-tools/access")) {
        critical.push(detail);
      }
    }
  });
  return { critical, network };
}

test.describe("Neuro Analysis private workspace", () => {
  test.describe.configure({ mode: "serial", timeout: 90_000 });
  test.skip(!email || !password, "NEURO_E2E_EMAIL and NEURO_E2E_PASSWORD are required.");

  test("loads owner data and primary actions on desktop", async ({ page }) => {
    const failures = collectBrowserFailures(page);
    const marketResponse = page.waitForResponse(
      (response) => response.url().includes("/api/neuro-analysis/market-data") && response.status() === 200,
      { timeout: 30_000 }
    );

    await signInToNeuro(page);
    await marketResponse;
    await expect(page.getByRole("link", { name: /business notebook/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /open navigation|abrir navegación/i })).toBeHidden();
    await expect(page.getByRole("textbox", { name: /active ticker|ticker activo/i })).toHaveCount(1);
    await expect(page.getByText("APPLE INC", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /find recent documents|buscar documentos recientes/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /run profile intelligence|correr inteligencia del profile/i })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(failures.critical, failures.network.join("\n")).toEqual([]);
    await page.screenshot({ path: "/tmp/neuro-analysis-desktop.png", fullPage: false });
  });

  test("keeps the active company and document flow usable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const failures = collectBrowserFailures(page);
    const marketResponse = page.waitForResponse(
      (response) => response.url().includes("/api/neuro-analysis/market-data") && response.status() === 200,
      { timeout: 30_000 }
    );

    await signInToNeuro(page);
    await marketResponse;
    await expect(page.getByRole("button", { name: /open navigation|abrir navegación/i })).toBeVisible();
    const topNavHeight = await page.locator("nav.nt-topnav").evaluate((element) => element.getBoundingClientRect().height);
    expect(topNavHeight).toBeLessThanOrEqual(90);
    const documentsButton = page.getByRole("button", { name: /find recent documents|buscar documentos recientes/i });
    await documentsButton.scrollIntoViewIfNeeded();
    await expect(documentsButton).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(failures.critical, failures.network.join("\n")).toEqual([]);
    await page.screenshot({ path: "/tmp/neuro-analysis-mobile.png", fullPage: false });
  });
});
