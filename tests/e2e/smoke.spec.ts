import { test, expect } from "@playwright/test";

test.describe("Smoke tests", () => {
  test("home page loads", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.locator("header").getByText("Neuro Trader Journal", { exact: true })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in|ingresar/i })).toBeVisible();
  });

  test("sign in page renders", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.getByRole("heading", { name: /log in|ingresar/i })).toBeVisible();
    const emailField = page.getByText(/Email|Correo/i).locator("..").locator("input");
    const passwordField = page.getByText(/Password|Contraseña/i).locator("..").locator("input");
    await expect(emailField).toBeVisible();
    await expect(passwordField).toBeVisible();
  });

  test("signup page renders stepper", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByText(/1\.\s*create account|1\.\s*crear cuenta/i)).toBeVisible();
    await expect(page.getByText(/2\.\s*verify email|2\.\s*verificar email/i)).toBeVisible();
  });

  test("contact page renders support form", async ({ page }) => {
    await page.goto("/contact");
    await expect(page.getByText(/Support & inquiries|Soporte y consultas/i)).toBeVisible();
    const nameField = page.getByText(/Full name|Nombre completo/i).locator("..").locator("input");
    const emailField = page.getByText(/Email|Correo/i).locator("..").locator("input");
    const messageField = page
      .getByText(/Message|Mensaje/i)
      .locator("..")
      .locator('textarea:not([name$="captcha-response"])');
    await expect(nameField).toBeVisible();
    await expect(emailField).toBeVisible();
    await expect(messageField).toBeVisible();
  });

  test("private route redirects to sign in", async ({ page }) => {
    await page.goto("/option-flow");
    await page.waitForURL(/\/signin/);
    await expect(page.getByRole("heading", { name: /log in|ingresar/i })).toBeVisible();
  });
});
