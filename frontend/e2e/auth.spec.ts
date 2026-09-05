import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API = "http://127.0.0.1:8010/api";

async function login(page: Page, password = "admin123") {
  await page.getByLabel("Admin Email").fill("admin@example.com");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Login as Admin" }).click();
}

async function resetAndLogout(request: APIRequestContext) {
  const loginResponse = await request.post(`${API}/admin/login`, { data: { email: "admin@example.com", password: "admin123" } });
  const token = (await loginResponse.json()).token;
  await request.post(`${API}/demo/reset`, { headers: { Authorization: `Bearer ${token}` } });
  await request.post(`${API}/admin/logout`, { headers: { Authorization: `Bearer ${token}` } });
}

test.describe.serial("protected routes and session behaviour", () => {
  test.beforeEach(async ({ request }) => resetAndLogout(request));

  test("Resident Registration redirects to dedicated login and returns after login", async ({ page }) => {
    await page.goto("/residents");
    await expect(page).toHaveURL(/\/admin-login$/);
    await expect(page.getByRole("heading", { name: "Admin Login Required" })).toBeVisible();
    await expect(page.getByText("Admin login is required to access this page.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Resident Registration/ })).not.toHaveClass(/bg-blue-700/);
    await login(page);
    await expect(page).toHaveURL(/\/residents$/);
    await expect(page.getByRole("heading", { name: "Add and verify residents" })).toBeVisible();
  });

  test("Lottery Draw redirects to login and returns after login", async ({ page }) => {
    await page.goto("/lottery");
    await expect(page).toHaveURL(/\/admin-login$/);
    await expect(page.getByRole("button", { name: /Lottery Draw/ })).not.toHaveClass(/bg-blue-700/);
    await login(page);
    await expect(page).toHaveURL(/\/lottery$/);
    await expect(page.getByRole("heading", { name: "Start AI-powered fair allocation" })).toBeVisible();
  });

  test("wrong login fails and correct login survives refresh", async ({ page }) => {
    await page.goto("/admin-login");
    await login(page, "wrong-password");
    await expect(page.getByText("Invalid admin email or password.")).toBeVisible();
    await page.getByLabel("Password").fill("admin123");
    await page.getByRole("button", { name: "Login as Admin" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("Admin session active")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Admin session active")).toBeVisible();
  });

  test("logout clears session and an invalid token redirects", async ({ page }) => {
    await page.goto("/admin-login");
    await login(page);
    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page).toHaveURL(/\/admin-login$/);
    await expect(page.getByRole("heading", { name: "Admin Login Required" })).toBeVisible();

    await page.evaluate(() => localStorage.setItem("ai_lottery_admin_token", "invalid-e2e-token"));
    await page.goto("/rooms");
    await expect(page).toHaveURL(/\/admin-login$/);
    await expect(page.getByRole("main").getByText("Your admin session has expired. Please log in again.").first()).toBeVisible();
  });
});
