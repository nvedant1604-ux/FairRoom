import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API = "http://127.0.0.1:8010/api";

async function resetAndLogout(request: APIRequestContext) {
  const response = await request.post(`${API}/admin/login`, {
    data: { email: "admin@example.com", password: "admin123" }
  });
  const token = (await response.json()).token as string;
  await request.post(`${API}/demo/reset`, { headers: { Authorization: `Bearer ${token}` } });
  await request.post(`${API}/admin/logout`, { headers: { Authorization: `Bearer ${token}` } });
}

async function login(page: Page) {
  await page.goto("/admin-login");
  await page.getByLabel("Admin Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("admin123");
  await page.getByRole("button", { name: "Login as Admin" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test.describe.serial("responsive application navigation", () => {
  test.beforeEach(async ({ request }) => {
    await resetAndLogout(request);
  });

  test("desktop sidebar exposes every route, has one active page, and persists collapse", async ({ page, request }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);

    const sidebar = page.getByTestId("desktop-sidebar");
    const navigation = sidebar.getByRole("navigation", { name: "Main navigation" });
    const expectedItems = [
      "Home Dashboard",
      "Resident Registration",
      "Room Management",
      "Lottery Draw",
      "Allocation Results",
      "Resident History",
      "Draw History",
      "Audit Logs",
      "Transparency Report",
      "Resident Search"
    ];
    for (const label of expectedItems) {
      await expect(navigation.getByRole("button", { name: label, exact: true })).toBeVisible();
    }

    expect(await page.evaluate(() => ({
      pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      navFits: (() => {
        const nav = document.querySelector('nav[aria-label="Main navigation"]');
        return nav ? nav.scrollWidth <= nav.clientWidth : false;
      })()
    }))).toEqual({ pageFits: true, navFits: true });

    const home = navigation.getByRole("button", { name: "Home Dashboard", exact: true });
    await expect(home).toHaveAttribute("aria-current", "page");
    await expect(home).toHaveClass(/bg-blue-700/);
    await navigation.getByRole("button", { name: "Resident Registration", exact: true }).click();
    await expect(page).toHaveURL(/\/residents$/);
    await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(navigation.getByRole("button", { name: "Resident Registration", exact: true })).toHaveAttribute("aria-current", "page");

    await expect(page.getByLabel("Current Building:")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Building" })).toBeVisible();
    await expect(page.getByText("admin@example.com")).toBeVisible();
    await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();

    const buildingId = await page.getByLabel("Current Building:").inputValue();
    const token = await page.evaluate(() => localStorage.getItem("ai_lottery_admin_token"));
    const cycleResponse = await request.post(`${API}/buildings/${buildingId}/draw-cycles`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        draw_name: "Navigation Test Cycle",
        phase_name: "Responsive navigation",
        reason: "Verify conditional setup navigation",
        planned_draw_date: null,
        notes: "E2E"
      }
    });
    expect(cycleResponse.ok(), await cycleResponse.text()).toBeTruthy();
    await page.reload();
    await expect(navigation.getByRole("button", { name: "Draw Cycle Setup", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(sidebar).toHaveAttribute("data-collapsed", "true");
    await expect(navigation.getByRole("button", { name: "Resident Registration", exact: true })).toHaveAttribute("title", "Resident Registration");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("sidebarCollapsed"))).toBe("true");
    await page.reload();
    await expect(sidebar).toHaveAttribute("data-collapsed", "true");
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  });

  test("welcome page selects a role and a protected URL preserves return-after-login", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Admin Login" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Resident Login" })).toBeVisible();
    await page.goto("/residents");
    await expect(page).toHaveURL(/\/admin-login$/);
    await expect(page.getByRole("heading", { name: "Admin Login Required" })).toBeVisible();
    await page.getByLabel("Admin Email").fill("admin@example.com");
    await page.getByLabel("Password").fill("admin123");
    await page.getByRole("button", { name: "Login as Admin" }).click();
    await expect(page).toHaveURL(/\/residents$/);
  });

  test("tablet starts collapsed and can expand", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.addInitScript(() => localStorage.removeItem("sidebarCollapsed"));
    await login(page);
    const sidebar = page.getByTestId("desktop-sidebar");
    await expect(sidebar).toBeVisible();
    await expect(sidebar).toHaveAttribute("data-collapsed", "true");
    await page.getByRole("button", { name: "Expand sidebar" }).click();
    await expect(sidebar).toHaveAttribute("data-collapsed", "false");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test("mobile drawer opens, closes after navigation, and supports Escape", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await expect(page.getByTestId("desktop-sidebar")).toBeHidden();
    await expect(page.getByLabel("Current Building:")).toBeVisible();

    const menuButton = page.getByRole("button", { name: "Open navigation menu" });
    await menuButton.click();
    const drawer = page.getByTestId("mobile-sidebar");
    await expect(drawer).toBeVisible();
    await drawer.getByRole("button", { name: "Resident Search", exact: true }).click();
    await expect(page).toHaveURL(/\/resident-search$/);
    await expect(drawer).toBeHidden();

    await menuButton.click();
    await expect(page.getByTestId("mobile-sidebar")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("mobile-sidebar")).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
