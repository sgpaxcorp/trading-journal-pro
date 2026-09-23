import { expect, test, type Page } from "@playwright/test";

const email = process.env.NEURO_E2E_EMAIL;
const password = process.env.NEURO_E2E_PASSWORD;
const bypassTermsOverlay = process.env.NEURO_E2E_BYPASS_TERMS === "1";

async function signInToNeuro(page: Page) {
  await page.goto("/signin?next=/neuro-analysis");
  await page.locator("#signin-email").fill(email ?? "");
  await page.locator("#signin-password").fill(password ?? "");
  await page.getByRole("button", { name: /log in|signing in/i }).click();
  await page.waitForURL(/\/neuro-analysis(?:\?|$)/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Neuro Investment Office" })).toBeVisible({ timeout: 20_000 });
  if (bypassTermsOverlay) {
    const termsHeading = page.getByRole("heading", { name: /review and accept to continue|revisa y acepta para continuar/i });
    await termsHeading.waitFor({ state: "visible", timeout: 5_000 }).catch(() => null);
    if (await termsHeading.isVisible().catch(() => false)) {
      await termsHeading.evaluate((element) => element.closest(".fixed")?.remove());
    }
  }
}

async function ensureCompanyProfile(page: Page, ticker = "AAPL") {
  const profileTabs = page.getByRole("button", { name: /documents|documentos/i, exact: true });
  if ((await profileTabs.count()) === 0) {
    const marketResponse = page.waitForResponse(
      (response) => response.url().includes("/api/neuro-analysis/market-data") && response.status() === 200,
      { timeout: 30_000 }
    );
    await page
      .getByRole("textbox", { name: /ticker or saved profile|ticker o profile guardado/i })
      .fill(ticker);
    await page.getByRole("button", { name: /open profile|abrir profile/i }).click();
    await marketResponse;
  }
  await expect(profileTabs).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(ticker, { exact: true }).first()).toBeVisible();
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

    await signInToNeuro(page);
    await page.getByRole("button", { name: /research library|biblioteca de research/i }).click();
    await expect(page.getByRole("link", { name: /business notebook/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /open navigation|abrir navegación/i })).toBeHidden();
    await expect(page.getByRole("textbox", { name: /ticker or saved profile|ticker o profile guardado/i })).toHaveCount(1);
    await expect(page.getByRole("heading", { name: /research library|biblioteca de research/i })).toBeVisible();
    await ensureCompanyProfile(page);
    await page.getByRole("button", { name: /documents|documentos/i, exact: true }).click();
    await expect(page.getByRole("button", { name: /find sec filings|buscar filings sec/i })).toBeVisible();
    await page.getByRole("button", { name: /reports|reportes/i, exact: true }).click();
    await expect(page.getByRole("button", { name: /run new report|correr nuevo reporte/i })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(failures.critical, failures.network.join("\n")).toEqual([]);
    await page.getByRole("button", { name: /overview|resumen/i, exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: "/tmp/neuro-analysis-desktop.png", fullPage: false });
  });

  test("runs the sector screener with visible coverage diagnostics", async ({ page }) => {
    const failures = collectBrowserFailures(page);

    await signInToNeuro(page);
    await page.getByRole("button", { name: /sector screener|screener por sector/i }).click();
    await expect(page.getByRole("heading", { name: /deterministic sector screener|screener determinístico por sector/i })).toBeVisible();
    await page.getByRole("textbox", { name: /custom tickers optional|tickers custom opcional/i }).fill("AAPL,MSFT");
    const screenerResponse = page.waitForResponse(
      (response) => response.url().includes("/api/neuro-analysis/sector-screener") && response.status() === 200,
      { timeout: 45_000 }
    );
    await page.getByRole("button", { name: /run screener|correr screener/i }).click();
    await screenerResponse;

    await expect(page.getByText(/average coverage|cobertura promedio/i)).toBeVisible();
    const screenerTable = page.getByRole("table").filter({ hasText: "AAPL" }).filter({ hasText: "MSFT" });
    await expect(screenerTable).toHaveCount(1);
    await expect(screenerTable.getByText("AAPL", { exact: true })).toBeVisible();
    await expect(screenerTable.getByText("MSFT", { exact: true })).toBeVisible();
    await expect(screenerTable.getByText(/SEC company facts/i)).toHaveCount(2);
    await expect(page.getByText(/price dislocation/i)).toHaveCount(0);
    expect(failures.critical, failures.network.join("\n")).toEqual([]);
    await page.screenshot({ path: "/tmp/neuro-sector-screener.png", fullPage: true });
  });

  test("keeps sector screener diagnostics usable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const failures = collectBrowserFailures(page);

    await signInToNeuro(page);
    await page.getByRole("button", { name: /sector screener|screener por sector/i }).click();
    await page.getByRole("textbox", { name: /custom tickers optional|tickers custom opcional/i }).fill("AAPL");
    const screenerResponse = page.waitForResponse(
      (response) => response.url().includes("/api/neuro-analysis/sector-screener") && response.status() === 200,
      { timeout: 45_000 }
    );
    await page.getByRole("button", { name: /run screener|correr screener/i }).click();
    await screenerResponse;

    await expect(page.getByText(/average coverage|cobertura promedio/i)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(failures.critical, failures.network.join("\n")).toEqual([]);
    await page.screenshot({ path: "/tmp/neuro-sector-screener-mobile.png", fullPage: false });
  });

  test("keeps the active company and document flow usable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const failures = collectBrowserFailures(page);

    await signInToNeuro(page);
    await page.getByRole("button", { name: /research library|biblioteca de research/i }).click();
    await ensureCompanyProfile(page);
    await expect(page.getByRole("button", { name: /open navigation|abrir navegación/i })).toBeVisible();
    const topNavHeight = await page.locator("nav.nt-topnav").evaluate((element) => element.getBoundingClientRect().height);
    expect(topNavHeight).toBeLessThanOrEqual(90);
    await page.getByRole("button", { name: /documents|documentos/i, exact: true }).click();
    const documentsButton = page.getByRole("button", { name: /find sec filings|buscar filings sec/i });
    await documentsButton.scrollIntoViewIfNeeded();
    await expect(documentsButton).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(failures.critical, failures.network.join("\n")).toEqual([]);
    await page.getByRole("button", { name: /overview|resumen/i, exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: "/tmp/neuro-analysis-mobile.png", fullPage: false });
  });
});
