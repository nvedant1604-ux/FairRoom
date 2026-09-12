import { useEffect, useState } from "react";
import { CalendarDays, History, MapPin, Search, X } from "lucide-react";

import { EmptyState } from "../components/EmptyState";
import { StatusPill } from "../components/StatusPill";
import { apiRequest } from "../lib/api";
import type { ResidentHistoryDetails, ResidentHistorySummary } from "../types";

type Tone = "green" | "orange" | "blue" | "purple" | "red" | "slate";

function statusTone(status: string): Tone {
  if (["Allocated", "Winner", "Verified"].includes(status)) return "green";
  if (status === "Waiting List") return "orange";
  if (["Rejected", "Not Selected"].includes(status)) return "red";
  return "slate";
}

export function ResidentHistory({ buildingId, buildingName }: { buildingId: number; buildingName: string }) {
  const [rows, setRows] = useState<ResidentHistorySummary[]>([]);
  const [query, setQuery] = useState("");
  const [details, setDetails] = useState<ResidentHistoryDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setRows([]); setDetails(null); setLoading(true); setError("");
    apiRequest<ResidentHistorySummary[]>(`/buildings/${buildingId}/residents/history`)
      .then((data) => { if (!cancelled) setRows(data); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Resident history could not be loaded."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [buildingId]);

  const normalizedQuery = query.toLowerCase();
  const shown = rows.filter((resident) => [
    resident.full_name, resident.old_room_number, resident.aadhaar_masked, resident.latest_allocated_room,
    resident.latest_draw_reference, resident.priority_category, resident.verification_status
  ].some((value) => String(value ?? "").toLowerCase().includes(normalizedQuery)));

  async function open(id: number) {
    setError("");
    try { setDetails(await apiRequest<ResidentHistoryDetails>(`/buildings/${buildingId}/residents/${id}/history`)); }
    catch (err) { setError(err instanceof Error ? err.message : "Resident details could not be loaded."); }
  }

  return <div className="space-y-5">
    <header className="overflow-hidden rounded-xl border border-sage bg-white shadow-soft">
      <div className="flex flex-col gap-4 bg-gradient-to-r from-cream via-white to-sage-light p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-earth">Permanent resident register</p><h2 className="mt-2 text-2xl font-bold text-navy sm:text-3xl">Resident History</h2><p className="mt-2 text-sm text-slate-600">Traceable allocation and verification history for {buildingName}.</p></div>
        <div className="rounded-xl border border-sage bg-white px-4 py-3 text-right"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Resident records</p><p className="mt-1 text-2xl font-bold text-forest">{rows.length}</p></div>
      </div>
    </header>

    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-soft">
      <label className="block text-sm font-semibold text-slate-700" htmlFor="resident-history-search">Find a resident or draw record</label>
      <div className="mt-2 flex items-center gap-3 rounded-lg border border-slate-300 bg-cream px-3 py-2 focus-within:border-earth focus-within:ring-2 focus-within:ring-earth/15"><Search aria-hidden="true" className="h-5 w-5 shrink-0 text-earth" /><input aria-label="Search resident history" className="w-full border-0 bg-transparent p-0 shadow-none focus:outline-none focus:ring-0" id="resident-history-search" placeholder="Search name, old room, Aadhaar last four, allocated room or draw reference" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
    </section>

    {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 font-semibold text-red-700" role="alert">{error}</p> : null}
    {loading ? <section className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600"><History aria-hidden="true" className="mx-auto h-7 w-7 animate-pulse text-earth" /><p className="mt-3 font-semibold">Loading traceable resident records…</p></section> : null}
    {!loading && shown.length === 0 ? <EmptyState title={query ? "No matching resident history" : "No resident history yet"} detail={query ? "Try a name, room, masked Aadhaar digits, or a draw reference." : "Verified residents and allocation records will appear here."} /> : null}
    {!loading && shown.length > 0 ? <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-soft"><div className="overflow-x-auto"><table className="min-w-[820px] w-full text-sm"><thead className="text-left text-xs uppercase tracking-wide text-slate-500"><tr>{["Resident", "Old Room", "Priority", "Verification", "Latest Allocation", "Latest Draw", "Draws", "Record"].map((label) => <th className="px-4 py-3" key={label}>{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{shown.map((resident) => <tr className="align-middle" key={resident.id}><td className="px-4 py-4"><p className="font-bold text-navy">{resident.full_name}</p><p className="mt-1 text-xs text-slate-500">{resident.aadhaar_masked}</p></td><td className="px-4 py-4 font-semibold text-slate-700">{resident.old_room_number}</td><td className="px-4 py-4">{resident.priority_category}</td><td className="px-4 py-4"><StatusPill label={resident.verification_status} tone={statusTone(resident.verification_status)} /></td><td className="px-4 py-4"><p className="font-semibold text-forest">{resident.latest_allocated_room ?? "Unallocated"}</p></td><td className="px-4 py-4 text-slate-600">{resident.latest_draw_reference ?? "—"}</td><td className="px-4 py-4"><span className="font-bold text-navy">{resident.draws_participated}</span></td><td className="px-4 py-4"><button className="focus-ring rounded-lg px-3 py-2 text-sm font-bold text-earth hover:bg-sage-light hover:text-forest" onClick={() => void open(resident.id)} type="button">View History</button></td></tr>)}</tbody></table></div></section> : null}

    {details ? <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4 sm:p-8"><section className="mx-auto max-w-4xl rounded-xl bg-white p-6 shadow-soft"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-earth">Traceable resident record</p><h3 className="mt-1 text-2xl font-bold text-navy">{details.resident.full_name}</h3><p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600"><MapPin aria-hidden="true" className="h-4 w-4 text-earth" />{details.building.building_name} · {details.building.society_name}</p></div><button aria-label="Close resident history" className="focus-ring rounded-lg p-2 text-slate-500 hover:bg-cream" onClick={() => setDetails(null)} type="button"><X aria-hidden="true" className="h-5 w-5" /></button></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-lg border border-slate-200 bg-cream p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Old room</p><p className="mt-1 font-bold text-navy">{details.resident.old_room_number}</p></div><div className="rounded-lg border border-slate-200 bg-cream p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Priority</p><p className="mt-1 font-bold text-navy">{details.resident.priority_category}</p></div><div className="rounded-lg border border-slate-200 bg-cream p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Verification</p><div className="mt-1"><StatusPill label={details.resident.verification_status} tone={statusTone(details.resident.verification_status)} /></div></div></div>
      <section className="mt-7"><div className="flex items-center gap-2"><History aria-hidden="true" className="h-5 w-5 text-earth" /><h4 className="text-xl font-bold text-navy">Chronological Timeline</h4></div>{details.events.length === 0 ? <p className="mt-3 rounded-lg bg-cream p-3 text-sm text-slate-600">No historical events are available for this resident.</p> : <div className="mt-4 space-y-4 border-l-2 border-sage pl-5">{details.events.map((event) => <article className="relative" key={event.id}><span aria-hidden="true" className="absolute -left-[1.83rem] top-1 h-3 w-3 rounded-full border-2 border-white bg-earth ring-1 ring-sage" /><p className="font-bold text-navy">{event.title}</p><p className="mt-1 text-sm text-slate-600">{event.description}</p><p className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500"><CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />{new Date(event.created_at).toLocaleString()} · {event.performed_by}</p></article>)}</div>}</section>
      {details.eligibility_history?.length ? <section className="mt-7"><h4 className="text-xl font-bold text-navy">Historical Eligibility</h4><div className="mt-3 grid gap-3">{details.eligibility_history.map(item => <article className="rounded-xl border border-sage bg-sage-light/40 p-4" key={item.draw_id}><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold text-navy">{item.draw_reference}</p><StatusPill label={item.status} tone={statusTone(item.status)} /></div><p className="mt-2 text-sm text-slate-700">Criteria version {item.rule_version ?? "fallback"} · Priority score {item.priority_score}</p><p className="mt-1 text-sm text-slate-600">{item.result.explanation}</p></article>)}</div></section> : null}
      <section className="mt-7"><h4 className="text-xl font-bold text-navy">Draw Participation</h4>{details.draws.length === 0 ? <p className="mt-3 rounded-lg bg-cream p-3 text-sm text-slate-600">No draw participation is recorded for this resident.</p> : <div className="mt-3 grid gap-3">{details.draws.map((draw) => <article className="rounded-xl border border-slate-200 bg-cream/45 p-4" key={draw.id}><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold text-navy">{draw.draw_reference}</p><StatusPill label={draw.allocation_status} tone={statusTone(draw.allocation_status)} /></div><p className="mt-2 text-sm text-slate-700">{draw.old_room_snapshot} → <span className="font-semibold text-forest">{draw.allocated_room_snapshot ?? "Unallocated"}</span></p><p className="mt-2 text-sm leading-6 text-slate-600">{draw.ai_explanation}</p></article>)}</div>}</section>
    </section></div> : null}
  </div>;
}
