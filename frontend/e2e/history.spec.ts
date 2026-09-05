import { expect, test, type APIRequestContext } from "@playwright/test";

const API = "http://127.0.0.1:8010/api";
async function auth(request: APIRequestContext) {
  const response = await request.post(`${API}/admin/login`, { data: { email: "admin@example.com", password: "admin123" } });
  return { Authorization: `Bearer ${(await response.json()).token}` };
}
const building = (name: string, pin: string) => ({ building_name: name, society_name: `${name} Society`, redevelopment_project_name: `${name} Project`, full_address: `1 ${name} Road`, city: "Mumbai", district: "Mumbai City", state: "Maharashtra", pin_code: pin, number_of_wings: 1, description: "History E2E" });
const resident = (name: string, aadhaar: string) => ({ full_name: name, aadhaar_number: aadhaar, old_room_number: `${name}-OLD`, family_members: 3, contact_number: "9345678901", priority_category: "General", building_wing: "A", document_name: null, consent: true });
const room = (number: string) => ({ room_number: number, wing: "A", floor: 1, size: "650 sq ft", status: "Available", suitable_for: "General" });

test("permanent draw and resident history is immutable and building scoped", async ({ request, page }) => {
  const headers = await auth(request);
  const aData = building("History Building A", "401001");
  const bData = building("History Building B", "401002");
  const a = (await (await request.post(`${API}/buildings`, { headers, data: aData })).json()).building;
  const b = (await (await request.post(`${API}/buildings`, { headers, data: bData })).json()).building;

  const created = await (await request.post(`${API}/buildings/${a.id}/residents`, { headers, data: resident("History Resident A", "866600000001") })).json();
  await request.post(`${API}/buildings/${a.id}/rooms`, { headers, data: room("HA-101") });
  await request.post(`${API}/buildings/${a.id}/residents/${created.resident.id}/verify`, { headers });
  const draw = await (await request.post(`${API}/buildings/${a.id}/lottery/draw`, { headers })).json();

  const drawsA = await (await request.get(`${API}/buildings/${a.id}/draws`, { headers })).json();
  expect(drawsA).toHaveLength(1);
  expect(drawsA[0]).toMatchObject({ id: draw.draw_id, draw_number: 1, status: "Completed", building_name_snapshot: aData.building_name, total_allocated: 1 });
  expect(await (await request.get(`${API}/buildings/${b.id}/draws`, { headers })).json()).toEqual([]);

  const details = await (await request.get(`${API}/buildings/${a.id}/draws/${draw.draw_id}`, { headers })).json();
  expect(details.allocations[0]).toMatchObject({ resident_name_snapshot: "History Resident A", allocated_room_snapshot: "HA-101", allocation_status: "Allocated" });
  const history = await (await request.get(`${API}/buildings/${a.id}/residents/${created.resident.id}/history`, { headers })).json();
  expect(history.events.map((event: { event_type: string }) => event.event_type)).toEqual(expect.arrayContaining(["Resident Registered", "Verification Pending", "Resident Verified", "Included In Draw", "Room Allocated"]));

  const renamed = { ...aData, building_name: "Renamed Current Building A" };
  expect((await request.put(`${API}/buildings/${a.id}`, { headers, data: renamed })).ok()).toBeTruthy();
  const afterRename = await (await request.get(`${API}/buildings/${a.id}/draws/${draw.draw_id}`, { headers })).json();
  expect(afterRename.draw.building_name_snapshot).toBe("History Building A");

  const csv = await (await request.get(`${API}/buildings/${a.id}/draws/${draw.draw_id}/report.csv`, { headers })).text();
  expect(csv).toContain("History Resident A");
  expect(csv).not.toContain("History Building B");
  for (const suffix of ["report.pdf", "certificate.pdf"]) {
    const file = await request.get(`${API}/buildings/${a.id}/draws/${draw.draw_id}/${suffix}`, { headers });
    expect(file.ok()).toBeTruthy();
    expect((await file.body()).length).toBeGreaterThan(100);
  }

  const blocked = await request.put(`${API}/buildings/${a.id}/draws/${draw.draw_id}`, { headers, data: { status: "Changed" } });
  expect(blocked.status()).toBe(423);
  expect((await blocked.json()).detail).toBe("Completed lottery history is locked and cannot be modified.");
  expect((await (await request.get(`${API}/buildings/${a.id}/audit`, { headers })).json()).some((entry: { action: string }) => entry.action === "Historical modification blocked")).toBe(true);
  expect((await request.get(`${API}/buildings/${b.id}/draws/${draw.draw_id}`, { headers })).status()).toBe(404);
  expect((await request.get(`${API}/buildings/999999/draws/${draw.draw_id}`, { headers })).status()).toBe(404);

  expect((await request.post(`${API}/buildings/${a.id}/demo/reset`, { headers })).ok()).toBeTruthy();
  const afterReset = await (await request.get(`${API}/buildings/${a.id}/draws/${draw.draw_id}`, { headers })).json();
  expect(afterReset.draw.draw_reference).toBe(draw.draw_reference);
  expect(afterReset.allocations[0].resident_name_snapshot).toBe("History Resident A");

  await page.goto("/admin-login");
  await page.getByLabel("Admin Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("admin123");
  await page.getByRole("button", { name: "Login as Admin" }).click();
  await page.getByLabel("Current Building:").selectOption(String(a.id));
  await page.getByRole("button", { name: /Draw History/ }).click();
  await expect(page.getByText(draw.draw_reference)).toBeVisible();
  await page.reload();
  await expect(page.getByText(draw.draw_reference)).toBeVisible();
});
