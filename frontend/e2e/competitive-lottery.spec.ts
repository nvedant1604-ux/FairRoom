import { expect,test,type APIRequestContext } from "@playwright/test";

const API="http://127.0.0.1:8010/api";
async function auth(r:APIRequestContext){const x=await r.post(`${API}/admin/login`,{data:{email:"admin@example.com",password:"admin123"}});return{Authorization:`Bearer ${(await x.json()).token}`}}
const building={building_name:"Competitive E2E",society_name:"Competitive Society",redevelopment_project_name:"Competitive Project",full_address:"1 Test Road",city:"Mumbai",district:"Mumbai City",state:"Maharashtra",pin_code:"405001",number_of_wings:1,description:"Competitive test"};
const resident=(n:number)=>({full_name:`Competitive Resident ${n}`,aadhaar_number:`8811000000${String(n).padStart(2,"0")}`,old_room_number:`OLD-C-${n}`,family_members:3,contact_number:"9456789012",priority_category:"General",building_wing:"A",consent:true});
const room=(n:number)=>({room_number:`C-${n}`,wing:"A",floor:1,size:"650 sq ft",status:"Available",suitable_for:"General"});

test("competitive lottery records a result for every participant and uses deterministic waiting-list positions",async({request})=>{
 const h=await auth(request);const b=(await(await request.post(`${API}/buildings`,{headers:h,data:building})).json()).building;
 const residents=[];for(let i=1;i<=4;i++){const r=(await(await request.post(`${API}/buildings/${b.id}/residents`,{headers:h,data:resident(i)})).json()).resident;residents.push(r);expect((await request.post(`${API}/buildings/${b.id}/residents/${r.id}/verify`,{headers:h})).ok()).toBeTruthy()}
 const rooms=[];for(let i=1;i<=2;i++)rooms.push(await(await request.post(`${API}/buildings/${b.id}/rooms`,{headers:h,data:room(i)})).json());
 const created=await request.post(`${API}/buildings/${b.id}/draw-cycles`,{headers:h,data:{draw_name:"Competitive wait list",reason:"Demand exceeds available rooms",lottery_mode:"Competitive Lottery",waiting_list_enabled:true}});expect(created.ok(),await created.text()).toBeTruthy();const cycle=await created.json();
 for(const r of residents)expect((await request.post(`${API}/buildings/${b.id}/draw-cycles/${cycle.draw_id}/residents`,{headers:h,data:{resident_id:r.id,include:true,reason:"Eligible"}})).ok()).toBeTruthy();
 for(const rm of rooms)expect((await request.post(`${API}/buildings/${b.id}/draw-cycles/${cycle.draw_id}/rooms`,{headers:h,data:{room_id:rm.id,include:true,reason:"Available"}})).ok()).toBeTruthy();
 const readiness=await(await request.get(`${API}/buildings/${b.id}/draw-cycles/${cycle.draw_id}/eligibility`,{headers:h})).json();expect(readiness.totals.expected_winners).toBe(2);expect(readiness.totals.expected_non_winners).toBe(2);
 expect((await request.post(`${API}/buildings/${b.id}/draw-cycles/${cycle.draw_id}/confirm`,{headers:h})).ok()).toBeTruthy();const draw=await request.post(`${API}/buildings/${b.id}/draw-cycles/${cycle.draw_id}/draw`,{headers:h});expect(draw.ok(),await draw.text()).toBeTruthy();
 const detail=await(await request.get(`${API}/buildings/${b.id}/draws/${cycle.draw_id}`,{headers:h})).json();expect(detail.draw.total_allocated).toBe(2);expect(detail.draw.total_waiting_list).toBe(2);expect(detail.allocations).toHaveLength(4);expect(detail.allocations.filter((x:{allocation_status:string})=>x.allocation_status==="Winner")).toHaveLength(2);const waiting=detail.allocations.filter((x:{allocation_status:string})=>x.allocation_status==="Waiting List");expect(waiting.map((x:{waiting_list_position:number})=>x.waiting_list_position)).toEqual([1,2]);
 const history=await(await request.get(`${API}/buildings/${b.id}/residents/${residents[0].id}/history`,{headers:h})).json();expect(history.draws).toHaveLength(1);
 const csv=await(await request.get(`${API}/buildings/${b.id}/draws/${cycle.draw_id}/report.csv`,{headers:h})).text();expect(csv).toContain("Competitive Lottery");expect(csv).toContain("Waiting List");
});
