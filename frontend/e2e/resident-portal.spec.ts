import { expect, test } from "@playwright/test";

const API = "http://127.0.0.1:8010/api";

test("role selection, resident-owned housing views, and logout", async ({ page, request }) => {
  const login = await request.post(`${API}/admin/login`, { data: { email: "admin@example.com", password: "admin123" } });
  expect(login.ok()).toBeTruthy();
  const admin = { Authorization: `Bearer ${(await login.json()).token}` };
  const suffix = String(Date.now());
  async function building(name: string) {
    const response = await request.post(`${API}/buildings`, { headers: admin, data: {
      building_name: name, society_name: `${name} Society`, redevelopment_project_name: "Resident portal test",
      full_address: "Dadar, Mumbai", city: "Mumbai", district: "Mumbai", state: "Maharashtra",
      pin_code: "400014", number_of_wings: 1, description: "", latitude: null, longitude: null,
      map_zoom: 17, location_status: "Not Set", google_place_id: null
    } });
    expect(response.ok(), await response.text()).toBeTruthy();
    return (await response.json()).building.id as number;
  }
  const a = await building(`Portal A ${suffix}`);
  const b = await building(`Portal B ${suffix}`);
  async function resident(buildingId: number, name: string, index: number) {
    const response = await request.post(`${API}/buildings/${buildingId}/residents`, { headers: admin, data: {
      full_name: name, aadhaar_number: `PORTAL-${suffix}-${index}`, old_room_number: `OLD-${suffix}-${index}`,
      family_members: 3, contact_number: "9456789012", priority_category: "General", building_wing: "A",
      consent: true, portal_password: "resident-test-password", document_name: "proof.pdf"
    } });
    expect(response.ok(), await response.text()).toBeTruthy();
    return (await response.json()).resident.id as number;
  }
  const residentId = await resident(a, "Portal Resident", 1);
  const otherId = await resident(b, "Other Building Resident", 2);
  expect((await request.post(`${API}/buildings/${a}/residents/${residentId}/verify`, { headers: admin })).ok()).toBeTruthy();
  const roomResponse = await request.post(`${API}/buildings/${a}/rooms`, { headers: admin, data: {
    room_number: "A-101", wing: "A", floor: 1, size: "650 sq ft", status: "Available", suitable_for: "General"
  } });
  expect(roomResponse.ok(), await roomResponse.text()).toBeTruthy();
  const draw = await request.post(`${API}/buildings/${a}/lottery/draw`, { headers: admin });
  expect(draw.ok(), await draw.text()).toBeTruthy();
  await request.post(`${API}/admin/logout`, { headers: admin });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Intelligent Housing Allocation System" })).toBeVisible();
  await page.getByRole("button", { name: "Resident Login" }).click();
  await page.getByLabel("Resident ID").fill(String(residentId));
  await page.getByLabel("Password").fill("resident-test-password");
  await page.getByRole("button", { name: "Login as Resident" }).click();
  await expect(page).toHaveURL(/\/resident\/dashboard$/);
  await expect(page.getByText("Welcome, Portal Resident")).toBeVisible();
  await expect(page.getByText("Winner").first()).toBeVisible();
  const sidebar = page.getByTestId("desktop-sidebar");
  await expect(sidebar.getByRole("button", { name: "Building Management" })).toHaveCount(0);
  await sidebar.getByRole("button", { name: "My Profile" }).click();
  await expect(page.getByText(`Resident ID`).first()).toBeVisible();
  await expect(page.getByText("Other Building Resident")).toHaveCount(0);
  await sidebar.getByRole("button", { name: "My Eligibility" }).click();
  await expect(page.getByRole("heading", { name: "My Eligibility" }).last()).toBeVisible();
  await sidebar.getByRole("button", { name: "My Lottery" }).click();
  await expect(page.getByText("A-101")).toBeVisible();
  await sidebar.getByRole("button", { name: "My Allocation" }).click();
  await expect(page.getByText("A-101")).toBeVisible();
  await sidebar.getByRole("button", { name: "My History" }).click();
  await expect(page.getByText("Resident Registered").first()).toBeVisible();

  const token = await page.evaluate(() => localStorage.getItem("fairroom_resident_token"));
  const residentHeaders = { Authorization: `Bearer ${token}` };
  expect((await request.get(`${API}/buildings/${b}/residents/${otherId}/history`, { headers: residentHeaders })).status()).toBe(403);
  expect((await request.get(`${API}/buildings/${a}/residents`, { headers: residentHeaders })).status()).toBe(403);
  await page.goto("/admin/dashboard");
  await expect(page).toHaveURL(/\/resident\/dashboard$/);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await page.getByTestId("mobile-sidebar").getByRole("button", { name: "My Profile" }).click();
  await expect(page).toHaveURL(/\/resident\/profile$/);
  await expect(page.getByTestId("mobile-sidebar")).toBeHidden();
  await page.setViewportSize({ width: 768, height: 1024 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/login$|\/resident\/login$/);
  expect((await request.get(`${API}/resident/profile`, { headers: residentHeaders })).status()).toBe(401);
});
