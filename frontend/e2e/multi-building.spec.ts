import { expect, test, type APIRequestContext } from "@playwright/test";

const API = "http://127.0.0.1:8010/api";
const building = (name:string, pin:string) => ({building_name:name,society_name:`${name} Society`,redevelopment_project_name:`${name} Project`,full_address:`1 ${name} Road, Mumbai`,city:"Mumbai",district:"Mumbai City",state:"Maharashtra",pin_code:pin,number_of_wings:2,description:"E2E building"});
async function admin(request:APIRequestContext){const response=await request.post(`${API}/admin/login`,{data:{email:"admin@example.com",password:"admin123"}});return {Authorization:`Bearer ${(await response.json()).token}`};}
const resident=(name:string,aadhaar:string,room:string)=>({full_name:name,aadhaar_number:aadhaar,old_room_number:room,family_members:3,contact_number:"9234567890",priority_category:"General",building_wing:"A",document_name:null,consent:true});
const room=(number:string)=>({room_number:number,wing:"A",floor:1,size:"650 sq ft",status:"Available",suitable_for:"General"});

test("independent buildings never mix residents, rooms, locks, reports or admin search", async ({page,request})=>{
  const headers=await admin(request);
  const addA=await request.post(`${API}/buildings`,{headers,data:building("E2E Building A","400001")}); expect(addA.ok()).toBeTruthy(); const a=(await addA.json()).building;
  const addB=await request.post(`${API}/buildings`,{headers,data:building("E2E Building B","400002")}); expect(addB.ok()).toBeTruthy(); const b=(await addB.json()).building;

  await page.goto("/admin-login"); await page.getByLabel("Admin Email").fill("admin@example.com"); await page.getByLabel("Password").fill("admin123"); await page.getByRole("button",{name:"Login as Admin"}).click(); await expect(page).toHaveURL(/\/$/);
  headers.Authorization = `Bearer ${await page.evaluate(() => localStorage.getItem("ai_lottery_admin_token"))}`;
  await expect(page.getByLabel("Current Building:")).toContainText("E2E Building A");
  await page.getByLabel("Current Building:").selectOption(String(a.id)); await page.reload(); await expect(page.getByLabel("Current Building:")).toHaveValue(String(a.id));

  const ra=await request.post(`${API}/buildings/${a.id}/residents`,{headers,data:resident("Building A Resident","855500000001","SHARED-OLD-101")}); const raBody=await ra.json(); expect(ra.ok(), JSON.stringify(raBody)).toBeTruthy(); const residentA=raBody.resident;
  expect((await request.post(`${API}/buildings/${a.id}/rooms`,{headers,data:room("SHARED-101")})).ok()).toBeTruthy();
  expect((await request.post(`${API}/buildings/${b.id}/residents`,{headers,data:resident("Building B Resident","855500000002","SHARED-OLD-101")})).ok()).toBeTruthy();
  expect((await request.post(`${API}/buildings/${b.id}/rooms`,{headers,data:room("SHARED-101")})).ok()).toBeTruthy();

  const duplicateRoom=await request.post(`${API}/buildings/${b.id}/rooms`,{headers,data:room("SHARED-101")}); expect(duplicateRoom.status()).toBe(409);
  const duplicateAadhaar=await request.post(`${API}/buildings/${b.id}/residents`,{headers,data:resident("Duplicate Aadhaar","855500000001","B-OTHER")}); expect(duplicateAadhaar.status()).toBe(409);
  expect((await request.get(`${API}/buildings/${b.id}/residents`,{headers})).json()).resolves.not.toContainEqual(expect.objectContaining({full_name:"Building A Resident"}));
  expect((await request.get(`${API}/buildings/${b.id}/rooms`,{headers})).json()).resolves.toHaveLength(1);

  expect((await request.post(`${API}/buildings/${a.id}/residents/${residentA.id}/verify`,{headers})).ok()).toBeTruthy();
  expect((await request.post(`${API}/buildings/${a.id}/lottery/draw`,{headers})).ok()).toBeTruthy();
  const statsA=await (await request.get(`${API}/buildings/${a.id}/dashboard`,{headers})).json(); const statsB=await (await request.get(`${API}/buildings/${b.id}/dashboard`,{headers})).json();
  expect(statsA.lottery_locked).toBe(true); expect(statsB.lottery_locked).toBe(false);
  expect((await request.post(`${API}/buildings/${b.id}/residents`,{headers,data:resident("Building B Second","855500000003","B-SECOND")})).ok()).toBeTruthy();

  const reportA=await (await request.get(`${API}/buildings/${a.id}/report`,{headers})).json(); const reportB=await (await request.get(`${API}/buildings/${b.id}/report`,{headers})).json();
  expect(reportA.allocations).toHaveLength(1); expect(reportA.allocations[0].full_name).toBe("Building A Resident"); expect(reportB.allocations).toHaveLength(0);
  const csvA=await (await request.get(`${API}/buildings/${a.id}/report.csv`,{headers})).text(); expect(csvA).toContain("Building A Resident"); expect(csvA).not.toContain("Building B Resident");

  expect((await request.get(`${API}/resident/search`,{headers,params:{building_id:a.id,query:"SHARED-OLD-101"}})).ok()).toBeTruthy();
  const wrongSearch=await request.get(`${API}/resident/search`,{headers,params:{building_id:b.id,query:"SHARED-OLD-101"}}); expect((await wrongSearch.json()).full_name).toBe("Building B Resident");
  expect((await request.get(`${API}/buildings/999999/dashboard`,{headers})).status()).toBe(404);
});
