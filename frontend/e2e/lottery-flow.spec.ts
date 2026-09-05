import fs from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const API = "http://127.0.0.1:8010/api";

async function login(page: Page) {
  await page.goto("/admin-login");
  await page.getByLabel("Admin Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("admin123");
  await page.getByRole("button", { name: "Login as Admin" }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function fillResident(page: Page, values: { name: string; aadhaar: string; room: string; contact: string }) {
  await page.getByLabel("Full Name").fill(values.name);
  await page.getByLabel("Aadhaar Number / ID Number").fill(values.aadhaar);
  await page.getByLabel("Old Room Number").fill(values.room);
  await page.getByLabel("Family Members").fill("3");
  await page.getByLabel("Contact Number").fill(values.contact);
  await page.getByLabel("Building/Wing").fill("E");
  await page.getByLabel("Priority Category").selectOption("General");
  await page.getByText("Resident consent is collected").getByRole("checkbox").check();
}

async function submitResident(page: Page, values: { name: string; aadhaar: string; room: string; contact: string }) {
  await fillResident(page, values);
  await page.getByRole("button", { name: "Save Resident" }).click();
}

async function expectNonEmptyDownload(page: Page, linkName: string) {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: linkName }).click();
  const download = await downloadPromise;
  const filePath = await download.path();
  expect(filePath).not.toBeNull();
  expect((await fs.stat(filePath!)).size).toBeGreaterThan(0);
}

test("complete reset, resident, lottery, reporting and public-search flow", async ({ page, request }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Reset Selected Building" })).toBeDisabled();

  await login(page);
  const resetButton = page.getByRole("button", { name: "Reset Selected Building" });
  await expect(resetButton).toBeEnabled();
  await resetButton.click();
  await expect(page.getByRole("heading", { name: /Reset demo data for/ })).toBeVisible();
  await page.locator(".fixed.inset-0").getByRole("button", { name: "Reset Selected Building", exact: true }).click();
  await expect(page.getByText("Demo data reset successfully. The lottery is now unlocked.")).toBeVisible();

  const token = await page.evaluate(() => localStorage.getItem("ai_lottery_admin_token"));
  expect(token).toBeTruthy();
  const auth = { Authorization: `Bearer ${token}` };
  const resetStats = await (await request.get(`${API}/dashboard`)).json();
  expect(resetStats).toMatchObject({ total_residents: 5, total_rooms: 16, allocated_rooms: 0, lottery_locked: false });
  expect(resetStats.lottery_completed_at).toBeFalsy();
  const resetAudits = await (await request.get(`${API}/audit`, { headers: auth })).json();
  expect(resetAudits).toHaveLength(1);
  expect(resetAudits[0].action).toBe("Demo Data Reset");

  await page.getByRole("button", { name: /Resident Registration/ }).click();
  const uniqueResident = { name: "E2E Resident", aadhaar: "811122223333", room: "E2E-ROOM-901", contact: "9123456780" };
  await submitResident(page, uniqueResident);
  await expect(page.getByText(/E2E Resident saved with masked Aadhaar/)).toBeVisible();

  await submitResident(page, { name: "Duplicate Aadhaar", aadhaar: uniqueResident.aadhaar, room: "E2E-ROOM-902", contact: "9123456781" });
  await expect(page.getByText("Duplicate Aadhaar or ID number detected.")).toBeVisible();
  await submitResident(page, { name: "Duplicate Room", aadhaar: "811122223334", room: uniqueResident.room, contact: "9123456782" });
  await expect(page.getByText("Duplicate old room number detected.")).toBeVisible();
  await submitResident(page, { name: "Invalid Contact", aadhaar: "811122223335", room: "E2E-ROOM-903", contact: "123" });
  await expect(page.getByText("Contact number must contain exactly 10 digits.")).toBeVisible();

  const residentRow = page.getByRole("row").filter({ hasText: "E2E Resident" });
  await residentRow.getByRole("button", { name: "Verify" }).click();
  await expect(residentRow.getByText("Verified")).toBeVisible();
  const rejectedRow = page.getByRole("row").filter({ hasText: "Ramesh Patil" });
  await rejectedRow.getByRole("button", { name: "Reject" }).click();
  await expect(rejectedRow.getByText("Rejected", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: /Room Management/ }).click();
  await expect(page.getByText("16 rooms")).toBeVisible();
  await page.getByRole("button", { name: /Lottery Draw/ }).click();
  await expect(page.getByText(/1 verified resident/)).toBeVisible();
  await expect(page.getByText(/16 available rooms/)).toBeVisible();
  await page.getByRole("button", { name: "Start Lottery Draw" }).click();
  await expect(page.getByRole("heading", { name: "Confirm locked lottery draw" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm and Start" }).click();
  await expect(page.getByText(/Transparent lottery starts in/)).toBeVisible();
  await expect(page.getByText("Lottery completed.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Lottery seed")).toBeVisible();
  await expect(page.getByText("Lottery Locked")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("lottery-completed.png"), fullPage: true });

  const allocations = await (await request.get(`${API}/allocations`)).json();
  expect(allocations.length).toBeGreaterThan(0);
  expect(new Set(allocations.map((item: { resident_id: number }) => item.resident_id)).size).toBe(allocations.length);
  expect(new Set(allocations.map((item: { room_id: number }) => item.room_id)).size).toBe(allocations.length);
  const completedStats = await (await request.get(`${API}/dashboard`)).json();
  expect(completedStats.lottery_locked).toBe(true);
  expect(completedStats.lottery_completed_at).toBeTruthy();

  await page.getByRole("button", { name: /Resident Registration/ }).click();
  await submitResident(page, { name: "Blocked Resident", aadhaar: "811122223399", room: "E2E-ROOM-999", contact: "9123456799" });
  await expect(page.getByText("Resident registration is locked because lottery has already started.")).toBeVisible();

  await page.getByRole("button", { name: /Allocation Results/ }).click();
  await expect(page.getByRole("heading", { name: "Locked allocation results" })).toBeVisible();
  const resultRow = page.getByRole("row").filter({ hasText: "E2E Resident" });
  await resultRow.getByRole("button", { name: "View Explanation" }).click();
  await expect(page.getByText(/No manual override was used/)).toBeVisible();
  await expectNonEmptyDownload(page, "Export CSV");

  await page.getByRole("button", { name: /Transparency Report/ }).click();
  await expect(page.getByRole("heading", { name: "Audit-ready project certificate" })).toBeVisible();
  await expectNonEmptyDownload(page, "Download PDF Report");
  await expectNonEmptyDownload(page, "Download Certificate PDF");

  await page.getByRole("button", { name: /Audit Logs/ }).click();
  await expect(page.getByRole("heading", { name: "Every important action is recorded" })).toBeVisible();
  const audits = await (await request.get(`${API}/audit`, { headers: auth })).json();
  const actions = new Set(audits.map((entry: { action: string }) => entry.action));
  for (const action of ["Demo Data Reset", "Resident added", "Document verified", "Document rejected", "Lottery started", "Lottery completed", "Report downloaded", "Admin override attempted"]) {
    expect(actions.has(action), `missing audit action: ${action}`).toBe(true);
  }

  await page.getByRole("button", { name: "Logout" }).click();
  await page.getByRole("button", { name: /Resident Search/ }).click();
  await expect(page).toHaveURL(/\/resident-search$/);
  await page.getByLabel("Aadhaar last 4 digits or old room number").fill(uniqueResident.room);
  await page.getByRole("button", { name: "Search Allocation" }).click();
  await expect(page.getByRole("heading", { name: "E2E Resident" })).toBeVisible();
  await expect(page.getByText("Allocated", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "AI Explanation" })).toBeVisible();
  await expect(page.getByText(/No manual override was used/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("public-resident-search.png"), fullPage: true });
});
