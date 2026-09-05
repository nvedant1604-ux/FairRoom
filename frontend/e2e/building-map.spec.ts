import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import path from "node:path";

const API = "http://127.0.0.1:8010/api";

async function adminHeaders(request: APIRequestContext) {
  const response = await request.post(`${API}/admin/login`, {
    data: { email: "admin@example.com", password: "admin123" }
  });
  return { Authorization: `Bearer ${(await response.json()).token}` };
}

function building(name: string, pin: string, latitude: number | null, longitude: number | null) {
  return {
    building_name: name,
    society_name: `${name} Society`,
    redevelopment_project_name: `${name} Redevelopment`,
    full_address: `${pin} Map Test Road`,
    city: "Mumbai",
    district: "Mumbai City",
    state: "Maharashtra",
    pin_code: pin,
    number_of_wings: 2,
    description: "Google Maps E2E fixture",
    latitude,
    longitude,
    map_zoom: 17,
    location_status: latitude === null ? "Not Set" : "Manual",
    google_place_id: null
  };
}

function geocodingBuilding(name = "SRA Shubham") {
  return {
    building_name: name,
    society_name: name === "SRA Shubham" ? "Sarthak CHS" : `${name} Society`,
    redevelopment_project_name: "Unrecognised Redevelopment Phase Name",
    full_address: "S. A. Palav Marg, Dadar East",
    city: "Mumbai",
    district: "Mumbai City",
    state: "Maharashtra",
    pin_code: "400014",
    number_of_wings: 2,
    description: "Deterministic geocoding fixture",
    latitude: null,
    longitude: null,
    map_zoom: 17,
    location_status: "Not Set",
    google_place_id: null
  };
}

async function login(page: Page) {
  await page.goto("/admin-login");
  await page.getByLabel("Admin Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("admin123");
  await page.getByRole("button", { name: "Login as Admin" }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function chooseBuilding(page: Page, id: number, name: string) {
  const selector = page.getByLabel("Current Building:");
  await expect(selector).toContainText(name);
  await selector.selectOption(String(id));
  await expect(selector).toHaveValue(String(id));
}

test.describe.serial("building location map", () => {
  test("switching buildings replaces map information, links, and missing-location state", async ({ page, request }) => {
    const headers = await adminHeaders(request);
    const responseA = await request.post(`${API}/buildings`, {
      headers,
      data: building("Map Building A", "410001", 19.101, 72.901)
    });
    const responseB = await request.post(`${API}/buildings`, {
      headers,
      data: building("Map Building B", "410002", 19.202, 72.802)
    });
    const responseC = await request.post(`${API}/buildings`, {
      headers,
      data: building("Map Building Empty", "410003", null, null)
    });
    expect(responseA.ok()).toBeTruthy();
    expect(responseB.ok()).toBeTruthy();
    expect(responseC.ok()).toBeTruthy();
    const a = (await responseA.json()).building;
    const b = (await responseB.json()).building;
    const c = (await responseC.json()).building;
    const googleRequests: string[] = [];
    page.on("request", (networkRequest) => {
      if (/googleapis\.com|maps\.google\.com\/maps\/api/.test(networkRequest.url())) googleRequests.push(networkRequest.url());
    });

    await login(page);
    await chooseBuilding(page, a.id, "Map Building A");
    await expect(page.getByTestId("map-test-mode")).toContainText("Map Building A");
    await expect(page.getByTestId("map-test-coordinates")).toHaveText("19.101, 72.901");
    await expect(page.getByText("Building Name").locator("..")).toContainText("Map Building A");
    const openA = page.getByRole("link", { name: "Open Map Building A in Google Maps" });
    const directionsA = page.getByRole("link", { name: "Get directions to Map Building A" });
    await expect(openA).toHaveAttribute("href", /19\.101%2C72\.901/);
    await expect(directionsA).toHaveAttribute("href", /19\.101%2C72\.901/);

    await chooseBuilding(page, b.id, "Map Building B");
    await expect(page.getByTestId("map-test-mode")).toContainText("Map Building B");
    await expect(page.getByTestId("map-test-coordinates")).toHaveText("19.202, 72.802");
    await expect(page.getByTestId("map-test-mode")).not.toContainText("Map Building A");
    await expect(page.getByRole("link", { name: "Open Map Building B in Google Maps" })).toHaveAttribute("href", /19\.202%2C72\.802/);
    await expect(page.getByRole("link", { name: "Get directions to Map Building B" })).toHaveAttribute("href", /19\.202%2C72\.802/);

    await chooseBuilding(page, c.id, "Map Building Empty");
    await expect(page.getByTestId("map-test-mode")).toContainText("Map Building Empty");
    await expect(page.getByTestId("map-test-coordinates")).toHaveText("Map location has not been configured for this building.");
    await expect(page.getByTestId("map-test-mode")).toContainText("Google Maps is not configured for this website.");
    await expect(page.locator("body")).not.toContainText("YOUR_PRIVATE_KEY");
    expect(googleRequests).toEqual([]);
  });

  test("administrator edits coordinates, receives the map audit, and mobile layout does not overflow", async ({ page, request }) => {
    const headers = await adminHeaders(request);
    const createdResponse = await request.post(`${API}/buildings`, {
      headers,
      data: building("Editable Map Building", "410004", 18.95, 72.84)
    });
    expect(createdResponse.ok()).toBeTruthy();
    const created = (await createdResponse.json()).building;

    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await chooseBuilding(page, created.id, "Editable Map Building");
    await expect(page.getByTestId("map-test-mode")).toContainText("Editable Map Building");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    await page.getByRole("button", { name: "Edit map location for Editable Map Building" }).click();
    await expect(page.getByRole("heading", { name: "Map Location" })).toBeVisible();
    await page.getByLabel("Latitude").fill("18.975");
    await page.getByLabel("Longitude").fill("72.865");
    await page.getByLabel("Map Zoom").fill("18");
    await page.getByRole("button", { name: "Save Building" }).click();
    await expect(page.getByText("Building map location updated successfully.")).toBeVisible();
    await expect(page.getByTestId("map-test-coordinates")).toHaveText("18.975, 72.865");
    await page.reload();
    await expect(page.getByTestId("map-test-coordinates")).toHaveText("18.975, 72.865");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    headers.Authorization = `Bearer ${await page.evaluate(() => localStorage.getItem("ai_lottery_admin_token"))}`;
    const persisted = await (await request.get(`${API}/buildings/${created.id}`, { headers })).json();
    expect(persisted.latitude).toBe(18.975);
    expect(persisted.longitude).toBe(72.865);
    expect(persisted.map_zoom).toBe(18);
    const audit = await (await request.get(`${API}/buildings/${created.id}/audit`, { headers })).json();
    const mapAudit = audit.find((entry: { action: string }) => entry.action === "Building Map Location Updated");
    expect(mapAudit).toMatchObject({ performed_by: "admin@example.com", building_id: created.id });
    expect(mapAudit.details).toContain(`Building ID ${created.id}`);
    expect(JSON.stringify(mapAudit)).not.toContain("VITE_GOOGLE_MAPS_API_KEY");
  });

  test("clean primary address lookup stays temporary until saving as Located", async ({ page, request }) => {
    const headers = await adminHeaders(request);
    const response = await request.post(`${API}/buildings`, { headers, data: geocodingBuilding() });
    expect(response.ok()).toBeTruthy();
    const created = (await response.json()).building;

    await login(page);
    await chooseBuilding(page, created.id, "SRA Shubham");
    await page.evaluate(() => sessionStorage.setItem("ai_lottery_maps_test_scenario", "primary-success"));
    await page.getByRole("button", { name: "Edit map location for SRA Shubham" }).click();
    await page.getByRole("button", { name: "Find Location from Address" }).click();

    await expect(page.getByText("Location found. Confirm that the pin is placed correctly.")).toBeVisible();
    await expect(page.getByTestId("geocoding-formatted-address")).toContainText("S. A. Palav Marg");
    await expect(page.getByLabel("Latitude")).toHaveValue("19.0178");
    await expect(page.getByLabel("Longitude")).toHaveValue("72.8478");
    await expect(page.getByLabel("Map Zoom")).toHaveValue("17");
    await expect(page.getByText("Location Status: Located")).toBeVisible();
    await expect(page.getByTestId("geocoding-attempt-count")).toHaveText("1");
    await expect(page.getByTestId("geocoding-attempts")).toContainText(
      "SRA Shubham, Sarthak CHS, S. A. Palav Marg, Dadar East, Mumbai, Maharashtra 400014, India"
    );
    await expect(page.getByTestId("geocoding-attempts")).not.toContainText("Unrecognised Redevelopment");

    headers.Authorization = `Bearer ${await page.evaluate(() => localStorage.getItem("ai_lottery_admin_token"))}`;
    const beforeSave = await (await request.get(`${API}/buildings/${created.id}`, { headers })).json();
    expect(beforeSave.latitude).toBeNull();
    expect(beforeSave.longitude).toBeNull();
    expect(beforeSave.location_status).toBe("Not Set");

    await page.getByRole("button", { name: "Save Building" }).click();
    await expect(page.getByText("Building map location updated successfully.")).toBeVisible();
    await expect(page.getByTestId("building-location-section")).toContainText("Location Status: Located");
    const afterSave = await (await request.get(`${API}/buildings/${created.id}`, { headers })).json();
    expect(afterSave).toMatchObject({
      latitude: 19.0178,
      longitude: 72.8478,
      map_zoom: 17,
      location_status: "Located",
      google_place_id: "test-primary-place"
    });
    expect(afterSave.location_updated_at).toBeTruthy();
  });

  test("fallback queries and geocoder statuses produce deterministic readable results", async ({ page, request }) => {
    const headers = await adminHeaders(request);
    const response = await request.post(`${API}/buildings`, {
      headers,
      data: { ...geocodingBuilding("Geocoder Status Building"), district: "Mumbai Suburban" }
    });
    expect(response.ok()).toBeTruthy();
    const created = (await response.json()).building;
    await login(page);
    await chooseBuilding(page, created.id, "Geocoder Status Building");
    await page.getByRole("button", { name: "Edit map location for Geocoder Status Building" }).click();
    const findButton = page.getByRole("button", { name: "Find Location from Address" });

    await page.evaluate(() => sessionStorage.setItem("ai_lottery_maps_test_scenario", "fallback-success"));
    await findButton.click();
    await expect(page.getByText("Location found. Confirm that the pin is placed correctly.")).toBeVisible();
    await expect(page.getByTestId("geocoding-attempt-count")).toHaveText("2");
    await expect(page.getByTestId("geocoding-attempts")).toContainText(
      "S. A. Palav Marg, Dadar East, Mumbai, Mumbai Suburban, Maharashtra 400014, India"
    );

    await page.evaluate(() => sessionStorage.setItem("ai_lottery_maps_test_scenario", "all-zero-results"));
    await findButton.click();
    await expect(page.getByRole("alert")).toHaveText(
      "Google could not find this address. Check the street, city and PIN code, or select the location manually."
    );
    await expect(page.getByTestId("geocoding-attempt-count")).toHaveText("5");

    await page.evaluate(() => sessionStorage.setItem("ai_lottery_maps_test_scenario", "request-denied"));
    await findButton.click();
    await expect(page.getByRole("alert")).toHaveText(
      "Address lookup is not authorised. Confirm that the Geocoding API is enabled and permitted for this API key."
    );

    await page.evaluate(() => sessionStorage.setItem("ai_lottery_maps_test_scenario", "over-query-limit"));
    await findButton.click();
    await expect(page.getByRole("alert")).toHaveText(
      "The Google Maps address lookup limit has been reached. Please try again later."
    );

    await page.evaluate(() => sessionStorage.setItem("ai_lottery_maps_test_scenario", "invalid-request"));
    await findButton.click();
    await expect(page.getByRole("alert")).toHaveText(
      "The address information is incomplete or invalid. Check the address fields and try again."
    );

    await page.evaluate(() => sessionStorage.setItem("ai_lottery_maps_test_scenario", "unknown-retry-success"));
    await findButton.click();
    await expect(page.getByText("Location found. Confirm that the pin is placed correctly.")).toBeVisible();
    await expect(page.getByTestId("geocoding-attempt-count")).toHaveText("2");

    await page.evaluate(() => sessionStorage.setItem("ai_lottery_maps_test_scenario", "unknown-retry-fail"));
    await findButton.click();
    await expect(page.getByRole("alert")).toHaveText(
      "Google Maps could not process the address temporarily. Please try again."
    );
    await expect(page.getByTestId("geocoding-attempt-count")).toHaveText("2");
  });

  test("manual click and marker drag update temporary coordinates and save as Manual", async ({ page, request }) => {
    const headers = await adminHeaders(request);
    const response = await request.post(`${API}/buildings`, {
      headers,
      data: geocodingBuilding("Manual Adjustment Building")
    });
    expect(response.ok()).toBeTruthy();
    const created = (await response.json()).building;
    await login(page);
    await chooseBuilding(page, created.id, "Manual Adjustment Building");
    await page.evaluate(() => sessionStorage.setItem("ai_lottery_maps_test_scenario", "primary-success"));
    await page.getByRole("button", { name: "Edit map location for Manual Adjustment Building" }).click();
    await page.getByRole("button", { name: "Find Location from Address" }).click();
    await expect(page.getByText("Location Status: Located")).toBeVisible();

    await page.getByRole("button", { name: "Simulate map click" }).click();
    await expect(page.getByLabel("Latitude")).toHaveValue("19.031");
    await expect(page.getByLabel("Longitude")).toHaveValue("72.861");
    await expect(page.getByText("Pin adjusted manually. Save the building to keep this location.")).toBeVisible();
    await expect(page.getByText("Location Status: Manual")).toBeVisible();

    await page.getByRole("button", { name: "Simulate marker drag" }).click();
    await expect(page.getByLabel("Latitude")).toHaveValue("19.041");
    await expect(page.getByLabel("Longitude")).toHaveValue("72.871");

    headers.Authorization = `Bearer ${await page.evaluate(() => localStorage.getItem("ai_lottery_admin_token"))}`;
    const beforeSave = await (await request.get(`${API}/buildings/${created.id}`, { headers })).json();
    expect(beforeSave.latitude).toBeNull();
    expect(beforeSave.location_status).toBe("Not Set");

    await page.getByRole("button", { name: "Save Building" }).click();
    await expect(page.getByTestId("building-location-section")).toContainText("Location Status: Manual");
    const afterSave = await (await request.get(`${API}/buildings/${created.id}`, { headers })).json();
    expect(afterSave).toMatchObject({
      latitude: 19.041,
      longitude: 72.871,
      location_status: "Manual",
      google_place_id: null
    });
  });

  test("captures responsive desktop, tablet, and mobile building map evidence", async ({ page, request }) => {
    const headers = await adminHeaders(request);
    const createdResponse = await request.post(`${API}/buildings`, {
      headers,
      data: building("Responsive Map Tower", "410005", 19.0178, 72.8478)
    });
    expect(createdResponse.ok()).toBeTruthy();
    const created = (await createdResponse.json()).building;
    await login(page);
    await chooseBuilding(page, created.id, "Responsive Map Tower");
    const section = page.getByTestId("building-location-section");
    await expect(section).toContainText("Responsive Map Tower");

    const sizes = [
      { name: "desktop", width: 1440, height: 900 },
      { name: "tablet", width: 768, height: 1024 },
      { name: "mobile", width: 390, height: 844 }
    ];
    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await expect(section).toBeVisible();
      await expect(section.getByRole("link", { name: "Open Responsive Map Tower in Google Maps" })).toBeVisible();
      await expect(section.getByRole("link", { name: "Get directions to Responsive Map Tower" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await section.screenshot({
        path: path.resolve(`../submission/screenshots/32-building-map-${size.name}.png`)
      });
    }
  });
});
