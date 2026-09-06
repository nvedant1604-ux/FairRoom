import { useEffect, useState } from "react";
import { CheckCircle2, DoorOpen, Users } from "lucide-react";

import { EmptyState } from "../components/EmptyState";
import { StatusPill } from "../components/StatusPill";
import { apiRequest } from "../lib/api";
import type { DrawCycleDetails } from "../types";

export function DrawCycleSetup({ buildingId, buildingName }: { buildingId: number; buildingName: string }) {
  const drawId = Number(localStorage.getItem("ai_lottery_active_draw_cycle"));
  const [data, setData] = useState<DrawCycleDetails | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const load = () => drawId ? apiRequest<DrawCycleDetails>(`/buildings/${buildingId}/draw-cycles/${drawId}/eligibility`).then(setData).catch((err) => setError(err instanceof Error ? err.message : "Draw cycle could not be loaded.")) : Promise.resolve();

  useEffect(() => { setData(null); setError(""); void load(); }, [buildingId, drawId]);

  async function setResidentEligibility(id: number, include: boolean, previous = false) {
    setError("");
    let reason = include ? "Selected by administrator" : "Excluded by administrator";
    let overrideConfirmed = false;
    if (include && previous) {
      reason = prompt("This resident already received a room in an earlier completed draw. Enter the required override reason:") || "";
      if (!reason) return;
      overrideConfirmed = window.confirm("Confirm inclusion of this previously allocated resident in the new draw cycle.");
      if (!overrideConfirmed) return;
    }
    try { await apiRequest(`/buildings/${buildingId}/draw-cycles/${drawId}/residents`, { method: "POST", body: JSON.stringify({ resident_id: id, include, reason, override_confirmed: overrideConfirmed }) }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Update failed"); }
  }
  async function setRoomEligibility(id: number, include: boolean) {
    setError("");
    try { await apiRequest(`/buildings/${buildingId}/draw-cycles/${drawId}/rooms`, { method: "POST", body: JSON.stringify({ room_id: id, include, reason: include ? "Selected by administrator" : "Excluded by administrator" }) }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Update failed"); }
  }
  async function confirm() {
    setError("");
    try { const result = await apiRequest<{ message: string }>(`/buildings/${buildingId}/draw-cycles/${drawId}/confirm`, { method: "POST" }); setMessage(result.message); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Confirmation failed"); }
  }

  if (!drawId) return <EmptyState title="No draw cycle selected" detail="Open Draw History and create or continue a draw cycle." />;
  if (!data) return <section className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600">{error || "Loading draw cycle setup…"}</section>;

  const cycle = data.cycle;
  const competitive = cycle.lottery_mode === "Competitive Lottery";
  const canEdit = cycle.status === "Preparing";
  const steps = ["Create cycle", "Select residents", "Select rooms", "Confirm eligibility", "Run lottery"];

  return <div className="space-y-5">
    <header className="overflow-hidden rounded-xl border border-sage bg-white shadow-soft">
      <div className="bg-gradient-to-r from-cream via-white to-sage-light p-5 sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.14em] text-earth">Official draw cycle · {buildingName}</p><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-bold text-navy sm:text-3xl">Draw {cycle.draw_number}: {cycle.draw_name}</h2><p className="mt-2 text-sm text-slate-600">{cycle.draw_reference} · {cycle.phase_name || "No phase name"} · {cycle.lottery_mode || "Full Allocation"}</p></div><StatusPill label={cycle.status} tone={cycle.status === "Ready" ? "green" : cycle.status === "Preparing" ? "orange" : "slate"} /></div></div>
      <div className="grid grid-cols-2 gap-px bg-sage/55 p-px md:grid-cols-5">{steps.map((step, index) => <div className={`bg-white p-3 text-center ${index === 3 && cycle.status === "Ready" ? "bg-sage-light" : ""}`} key={step}><span className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-sage-light text-xs font-bold text-earth">{index + 1}</span><p className="mt-2 text-xs font-bold uppercase tracking-wide text-forest">{step}</p></div>)}</div>
    </header>

    {competitive ? <section className="rounded-xl border border-clay/50 bg-sand/45 p-5"><h3 className="font-bold text-terracotta-dark">Competitive Lottery</h3><p className="mt-1 text-sm text-slate-700">All eligible residents may participate. The stored seed will select winners up to the number of selected available rooms.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Eligible residents", data.totals.included_residents], ["Available rooms", data.totals.included_rooms], ["Expected winners", data.totals.expected_winners], ["Not selected", data.totals.expected_non_winners]].map(([label, value]) => <div className="rounded-lg bg-white p-3" key={String(label)}><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-navy">{value}</p></div>)}</div><p className="mt-3 text-sm font-semibold text-orange-800">Waiting List: {cycle.waiting_list_enabled ? "Enabled — non-winners receive deterministic positions." : "Disabled — non-winners are recorded as Not Selected."}</p></section> : <section className="rounded-xl border border-sage bg-sage-light/55 p-5"><h3 className="font-bold text-forest">Full Allocation</h3><p className="mt-1 text-sm text-slate-700">Included verified residents will be matched with the selected rooms through the locked seeded process.</p></section>}

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(data.totals).slice(0, 4).map(([label, value]) => <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-soft" key={label}><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label.replaceAll("_", " ")}</p><p className="mt-2 text-2xl font-bold text-navy">{value}</p></article>)}</section>
    {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 font-semibold text-red-700" role="alert">{error}</p> : null}
    {message ? <p className="rounded-lg border border-green-200 bg-green-50 p-3 font-semibold text-green-700" role="status">{message}</p> : null}

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-soft"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-cream p-4"><div className="flex items-center gap-2"><Users aria-hidden="true" className="h-5 w-5 text-earth" /><div><h3 className="font-bold text-navy">Resident Eligibility</h3><p className="text-sm text-slate-600">Only verified residents may be included in this cycle.</p></div></div><StatusPill label={`${data.totals.included_residents} included`} tone="green" /></div><div className="overflow-x-auto"><table className="min-w-[700px] w-full text-sm"><thead className="text-left text-xs uppercase tracking-wide text-slate-500"><tr>{["Included", "Resident", "Old Room", "Priority", "Verification", "Eligibility"].map((label) => <th className="px-4 py-3" key={label}>{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{data.residents.map((resident) => <tr key={resident.id}><td className="px-4 py-3"><input aria-label={`Include ${resident.full_name}`} checked={resident.eligibility_status === "Included"} disabled={!canEdit || resident.verification_status !== "Verified" || Boolean(resident.previous_draw_id)} onChange={(event) => void setResidentEligibility(resident.resident_id, event.target.checked, Boolean(resident.previous_draw_id))} type="checkbox" /></td><td className="px-4 py-3 font-semibold text-navy">{resident.full_name}</td><td className="px-4 py-3">{resident.old_room_snapshot}</td><td className="px-4 py-3">{resident.priority_snapshot}</td><td className="px-4 py-3"><StatusPill label={resident.verification_status} tone={resident.verification_status === "Verified" ? "green" : "orange"} /></td><td className="px-4 py-3"><p className="font-semibold text-slate-700">{resident.eligibility_status}</p><small className="block text-slate-500">{resident.inclusion_reason || resident.exclusion_reason}</small></td></tr>)}</tbody></table></div></section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-soft"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-cream p-4"><div className="flex items-center gap-2"><DoorOpen aria-hidden="true" className="h-5 w-5 text-earth" /><div><h3 className="font-bold text-navy">Room Eligibility</h3><p className="text-sm text-slate-600">Only selected available rooms enter the draw.</p></div></div><StatusPill label={`${data.totals.included_rooms} included`} tone="green" /></div><div className="overflow-x-auto"><table className="min-w-[650px] w-full text-sm"><thead className="text-left text-xs uppercase tracking-wide text-slate-500"><tr>{["Included", "Room", "Wing", "Floor", "Size", "Eligibility"].map((label) => <th className="px-4 py-3" key={label}>{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{data.rooms.map((room) => <tr key={room.id}><td className="px-4 py-3"><input aria-label={`Include room ${room.room_number_snapshot}`} checked={room.eligibility_status === "Included"} disabled={!canEdit || room.eligibility_status === "Already Allocated"} onChange={(event) => void setRoomEligibility(room.room_id, event.target.checked)} type="checkbox" /></td><td className="px-4 py-3 font-semibold text-navy">{room.room_number_snapshot}</td><td className="px-4 py-3">{room.wing_snapshot}</td><td className="px-4 py-3">{room.floor_snapshot}</td><td className="px-4 py-3">{room.size_snapshot}</td><td className="px-4 py-3"><p className="font-semibold text-slate-700">{room.eligibility_status}</p><small className="block text-slate-500">{room.inclusion_reason || room.exclusion_reason}</small></td></tr>)}</tbody></table></div></section>
    {canEdit ? <button className="focus-ring inline-flex items-center gap-2 rounded-lg bg-earth px-5 py-3 font-bold text-white shadow-soft hover:bg-forest" onClick={() => void confirm()} type="button"><CheckCircle2 aria-hidden="true" className="h-5 w-5" />Confirm Eligibility and Mark Ready</button> : null}
  </div>;
}
