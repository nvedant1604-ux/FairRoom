import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const screenshots = path.resolve("..", "submission", "screenshots");

async function login(page: Page) {
  await page.goto("/admin-login");
  await page.getByLabel("Admin Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("admin123");
  await page.getByRole("button", { name: "Login as Admin" }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function expectNoPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

test("captures and verifies expanded, collapsed, tablet, and mobile navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.evaluate(() => localStorage.removeItem("sidebarCollapsed"));
  await page.reload();

  const desktopSidebar = page.getByTestId("desktop-sidebar");
  await expect(desktopSidebar).toHaveAttribute("data-collapsed", "false");
  await expect(page.getByLabel("Current Building:")).toBeVisible();
  await expect(page.getByText("admin@example.com")).toBeVisible();
  await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();
  await expect(desktopSidebar.getByRole("button", { name: "Home Dashboard", exact: true })).toHaveAttribute("aria-current", "page");
  await expectNoPageOverflow(page);
  expect(await page.evaluate(() => {
    const sidebar = document.querySelector('[data-testid="desktop-sidebar"]')?.getBoundingClientRect();
    const main = document.querySelector("main")?.getBoundingClientRect();
    return Boolean(sidebar && main && main.left >= sidebar.right);
  })).toBe(true);
  await page.screenshot({ path: path.join(screenshots, "29-sidebar-expanded.png"), fullPage: false });

  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(desktopSidebar).toHaveAttribute("data-collapsed", "true");
  await expect(desktopSidebar.getByRole("button", { name: "Transparency Report", exact: true })).toHaveAttribute(
    "title",
    "Transparency Report"
  );
  await expectNoPageOverflow(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(screenshots, "30-sidebar-collapsed.png"), fullPage: false });

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.evaluate(() => localStorage.removeItem("sidebarCollapsed"));
  await page.reload();
  await expect(desktopSidebar).toHaveAttribute("data-collapsed", "true");
  await expect(page.getByLabel("Current Building:")).toBeVisible();
  await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();
  await expectNoPageOverflow(page);
  expect(await page.evaluate(() => {
    const sidebar = document.querySelector('[data-testid="desktop-sidebar"]')?.getBoundingClientRect();
    const main = document.querySelector("main")?.getBoundingClientRect();
    return Boolean(sidebar && main && main.left >= sidebar.right);
  })).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByTestId("desktop-sidebar")).toBeHidden();
  await expect(page.getByLabel("Current Building:")).toBeVisible();
  await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  const mobileSidebar = page.getByTestId("mobile-sidebar");
  await expect(mobileSidebar).toBeVisible();
  await expect(mobileSidebar.getByRole("button", { name: "Resident Registration", exact: true })).toBeVisible();
  await expect(mobileSidebar.getByRole("button", { name: "Allocation Results", exact: true })).toBeVisible();
  await expect(mobileSidebar.getByRole("button", { name: "Transparency Report", exact: true })).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({ path: path.join(screenshots, "31-mobile-navigation.png"), fullPage: false });
});
