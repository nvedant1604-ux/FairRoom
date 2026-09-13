import { useEffect, useState } from "react";

import { ResidentShell, type ResidentPageKey } from "./components/ResidentShell";
import { StatusPill } from "./components/StatusPill";
import { apiRequest } from "./lib/api";

type Profile = {
  id: number; full_name: string; aadhaar_masked: string; old_room_number: string;
  family_members: number; contact_number: string; priority_category: string; building_wing: string;
  verification_status: string; created_at: string; date_of_birth: string | null;
  residency_start_date: string | null; resident_category: string | null;
  building_name: string; society_name: string; full_address: string; building_status: string;
};
type Rule = { rule_name: string; category: string; passed: boolean; points_awarded: number; explanation: string };
type Eligibility = { status: string; eligible: boolean; priority_score: number; rule_version: number | null;
  configuration_status: string; results: Rule[]; explanation: string; evaluated_at: string };
type Draw = { draw_number: number; draw_reference: string; draw_name: string; draw_status: string;
  lottery_mode: string; completed_at: string | null; participation_status: string | null;
  eligibility_status: string | null; priority_score: number | null; allocation_status: string | null;
  room_number: string | null; waiting_list_position: number | null; result: string };
type Lottery = { draws: Draw[]; latest: Draw | null };
type Allocation = { building_name: string; allocation: null | { allocated_at: string; room_number: string;
  wing: string; floor: number; size: string; draw_number: number | null; draw_reference: string | null } };
type History = { events: { event_type: string; title: string; description: string; created_at: string; draw_id: number | null }[] };
type PortalData = { profile: Profile; eligibility: Eligibility; lottery: Lottery; allocation: Allocation; history: History };

const paths: Record<string, ResidentPageKey> = {
  "/resident/dashboard": "residentDashboard", "/resident/profile": "residentProfile",
  "/resident/eligibility": "residentEligibility", "/resident/lottery": "residentLottery",
  "/resident/allocation": "residentAllocation", "/resident/history": "residentHistorySelf"
};
const urls = Object.fromEntries(Object.entries(paths).map(([url, key]) => [key, url]));

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="min-w-0 rounded-xl border border-sage/60 bg-white p-5 shadow-soft">
    <h2 className="text-lg font-bold text-navy">{title}</h2><div className="mt-4">{children}</div>
  </section>;
}
function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="min-w-0 border-b border-slate-100 py-2 last:border-0">
    <dt className="text-xs font-bold uppercase tracking-wide text-fairness">{label}</dt>
    <dd className="mt-1 break-words text-sm font-semibold text-navy">{value ?? "Not provided"}</dd>
  </div>;
}
function tone(value: string): "green" | "orange" | "red" | "slate" {
  if (["Verified", "Eligible", "Winner", "Allocated"].includes(value)) return "green";
  if (["Ineligible", "Rejected"].includes(value)) return "red";
  if (["Waiting List", "Participating", "Pending Verification"].includes(value)) return "orange";
  return "slate";
}

export function ResidentPortal({ residentName, onLogout }: { residentName: string; onLogout: () => void }) {
  const [page, setPage] = useState<ResidentPageKey>(() => paths[window.location.pathname] ?? "residentDashboard");
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([
      apiRequest<Profile>("/resident/profile"), apiRequest<Eligibility>("/resident/eligibility"),
      apiRequest<Lottery>("/resident/lottery"), apiRequest<Allocation>("/resident/allocation"),
      apiRequest<History>("/resident/history")
    ]).then(([profile, eligibility, lottery, allocation, history]) => {
      if (live) setData({ profile, eligibility, lottery, allocation, history });
    }).catch(err => { if (live) setError(err instanceof Error ? err.message : "Resident information is unavailable."); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    const update = () => setPage(paths[window.location.pathname] ?? "residentDashboard");
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  function navigate(next: ResidentPageKey) {
    if (!urls[next]) return;
    window.history.pushState({}, "", urls[next]); setPage(next);
  }
  const profile = data?.profile;
  const eligibility = data?.eligibility;
  const latest = data?.lottery.latest;
  const allocation = data?.allocation.allocation;
  const profileCard = profile && <Card title="My Profile"><dl className="grid gap-x-6 sm:grid-cols-2">
    <Detail label="Name" value={profile.full_name}/><Detail label="Resident ID" value={profile.id}/>
    <Detail label="Building" value={profile.building_name}/><Detail label="Society" value={profile.society_name}/>
    <Detail label="Old room" value={profile.old_room_number}/><Detail label="Wing" value={profile.building_wing}/>
    <Detail label="Contact" value={profile.contact_number}/><Detail label="Aadhaar / ID" value={profile.aadhaar_masked}/>
    <Detail label="Family members" value={profile.family_members}/><Detail label="Priority category" value={profile.priority_category}/>
    <Detail label="Verification" value={<StatusPill label={profile.verification_status} tone={tone(profile.verification_status)}/>}/>
    <Detail label="Registered" value={new Date(profile.created_at).toLocaleDateString()}/>
    <Detail label="Date of birth" value={profile.date_of_birth}/><Detail label="Residency start" value={profile.residency_start_date}/>
    <Detail label="Policy category" value={profile.resident_category}/>
  </dl></Card>;
  const eligibilityCard = eligibility && <Card title="My Eligibility">
    <div className="flex flex-wrap items-center gap-3"><StatusPill label={eligibility.status} tone={tone(eligibility.status)}/>
      <span className="text-sm font-semibold text-forest">Priority points: +{eligibility.priority_score}</span></div>
    <p className="mt-3 text-sm text-slate-700">{eligibility.explanation}</p>
    <p className="mt-2 text-xs text-slate-500">{eligibility.configuration_status}</p>
    {eligibility.results.length ? <div className="mt-4 space-y-2">{eligibility.results.map((rule, index) =>
      <div className="rounded-lg border border-sage/60 bg-sage-light/30 p-3 text-sm" key={`${rule.rule_name}-${index}`}>
        <div className="flex flex-wrap items-center gap-2"><StatusPill label={rule.passed ? "Passed" : "Not met"} tone={rule.passed ? "green" : "red"}/>
          <strong className="text-navy">{rule.rule_name}</strong>{rule.points_awarded > 0 ? <span className="text-forest">+{rule.points_awarded} points</span> : null}</div>
        <p className="mt-2 text-slate-700">{rule.explanation}</p>
      </div>)}</div> : null}
  </Card>;
  const lotteryCard = <Card title="My Lottery">
    {!latest ? <p className="text-sm text-slate-600">No lottery participation has been recorded yet.</p> : <>
      <div className="flex flex-wrap items-center gap-3"><StatusPill label={latest.result} tone={tone(latest.result)}/>
        <span className="text-sm text-slate-600">{latest.draw_name} · Draw {latest.draw_number}</span></div>
      <dl className="mt-3 grid gap-x-6 sm:grid-cols-2"><Detail label="Draw status" value={latest.draw_status}/>
        <Detail label="Participation" value={latest.participation_status ?? "Recorded"}/>
        <Detail label="Lottery mode" value={latest.lottery_mode}/>
        <Detail label="Waiting list position" value={latest.waiting_list_position ?? "Not waiting-listed"}/>
        <Detail label="Allocated room" value={latest.room_number ?? "No room allocated in this draw"}/></dl>
    </>}
  </Card>;
  const allocationCard = <Card title="My Allocation">
    {!allocation ? <p className="text-sm text-slate-600">No room has been allocated to you yet.</p> :
      <dl className="grid gap-x-6 sm:grid-cols-2"><Detail label="Building" value={data?.allocation.building_name}/>
        <Detail label="Room" value={allocation.room_number}/><Detail label="Wing" value={allocation.wing}/>
        <Detail label="Floor" value={allocation.floor}/><Detail label="Size" value={allocation.size}/>
        <Detail label="Draw" value={allocation.draw_number ? `Draw ${allocation.draw_number}` : "Legacy allocation"}/>
        <Detail label="Allocation date" value={new Date(allocation.allocated_at).toLocaleDateString()}/></dl>}
  </Card>;
  const historyCard = <Card title="My History">
    {data?.history.events.length ? <ol className="space-y-3">{data.history.events.map((event, index) =>
      <li className="rounded-lg border border-sage/60 bg-sage-light/20 p-3" key={`${event.created_at}-${index}`}>
        <p className="font-semibold text-navy">{event.title}</p><p className="mt-1 text-sm text-slate-700">{event.description}</p>
        <p className="mt-2 text-xs text-fairness">{new Date(event.created_at).toLocaleString()}</p>
      </li>)}</ol> : <p className="text-sm text-slate-600">No history events are recorded yet.</p>}
  </Card>;
  return <ResidentShell activePage={page} residentName={residentName} onNavigate={navigate} onLogout={onLogout}>
    {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
    {!data && !error ? <p className="text-sm text-slate-600">Loading your housing information…</p> : null}
    {data ? <div className="space-y-6">
      {page === "residentDashboard" ? <>
        <div className="rounded-xl border border-sage bg-sage-light/60 p-5 shadow-soft">
          <p className="text-sm font-semibold uppercase tracking-wide text-earth">My housing overview</p>
          <h2 className="mt-2 text-2xl font-extrabold text-navy">Welcome, {profile?.full_name}</h2>
          <p className="mt-1 text-sm text-forest">{profile?.building_name}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[["Verification", profile?.verification_status], ["Eligibility", eligibility?.status],
            ["Priority points", `+${eligibility?.priority_score ?? 0}`], ["Lottery result", latest?.result ?? "No draw yet"]].map(([label, value]) =>
            <div className="rounded-xl border border-sage/60 bg-white p-4 shadow-soft" key={label}>
              <p className="text-xs font-bold uppercase tracking-wide text-fairness">{label}</p>
              <p className="mt-2 break-words text-lg font-bold text-navy">{value}</p>
            </div>)}</div>
        <div className="grid gap-6 lg:grid-cols-2">{eligibilityCard}{lotteryCard}{allocationCard}{historyCard}</div>
      </> : null}
      {page === "residentProfile" ? profileCard : null}
      {page === "residentEligibility" ? eligibilityCard : null}
      {page === "residentLottery" ? <div className="space-y-6">{lotteryCard}
        {data.lottery.draws.length > 1 ? <Card title="My Lottery History"><div className="space-y-3">{data.lottery.draws.map(draw =>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sage/60 p-3" key={draw.draw_reference}>
            <div><p className="font-semibold text-navy">Draw {draw.draw_number}: {draw.draw_name}</p>
              <p className="text-xs text-slate-500">{draw.completed_at ? new Date(draw.completed_at).toLocaleDateString() : draw.draw_status}</p></div>
            <StatusPill label={draw.result} tone={tone(draw.result)}/></div>)}</div></Card> : null}
      </div> : null}
      {page === "residentAllocation" ? allocationCard : null}
      {page === "residentHistorySelf" ? historyCard : null}
    </div> : null}
  </ResidentShell>;
}
