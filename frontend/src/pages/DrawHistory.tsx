import { useEffect, useState, type FormEvent } from "react";
import { Archive, CalendarDays, FileCheck2, PlayCircle, Plus, X } from "lucide-react";

import { StatusPill } from "../components/StatusPill";
import { apiRequest, authenticatedDownload } from "../lib/api";
import type { DrawDetails, LotteryDraw } from "../types";

type Tone = "green" | "orange" | "blue" | "purple" | "red" | "slate";

function statusTone(status: string): Tone {
  if (status === "Completed") return "green";
  if (status === "Preparing") return "orange";
  if (status === "Ready") return "blue";
  if (status === "In Progress") return "purple";
  if (status === "Failed") return "red";
  return "slate";
}

export function DrawHistory({ buildingId, buildingName }: { buildingId: number; buildingName: string }) {
  const [draws, setDraws] = useState<LotteryDraw[]>([]);
  const [details, setDetails] = useState<DrawDetails | null>(null);
  const [creating, setCreating] = useState(() => new URLSearchParams(location.search).has("create"));
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    draw_name: "Remaining Residents Phase", phase_name: "", reason: "Additional allocation phase", planned_draw_date: "", notes: "", lottery_mode: "Full Allocation", waiting_list_enabled: false
  });
  const load = () => apiRequest<LotteryDraw[]>(`/buildings/${buildingId}/draws`).then(setDraws).catch((err) => setError(err instanceof Error ? err.message : "Draw history could not be loaded."));

  useEffect(() => { setDraws([]); setDetails(null); void load(); }, [buildingId]);

  function setup(id: number) {
    localStorage.setItem("ai_lottery_active_draw_cycle", String(id));
    history.pushState({}, "", "/draw-cycle-setup");
    dispatchEvent(new PopStateEvent("popstate"));
  }
  function openLottery(id: number) {
    localStorage.setItem("ai_lottery_active_draw_cycle", String(id));
    history.pushState({}, "", "/lottery");
    dispatchEvent(new PopStateEvent("popstate"));
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    try {
      const result = await apiRequest<{ draw_id: number }>(`/buildings/${buildingId}/draw-cycles`, { method: "POST", body: JSON.stringify(form) });
      setCreating(false); await load(); setup(result.draw_id);
    } catch (err) { setError(err instanceof Error ? err.message : "Creation failed"); }
  }
  async function cancel(draw: LotteryDraw) {
    const reason = prompt("Enter cancellation reason");
    if (!reason) return;
    setError("");
    try { await apiRequest(`/buildings/${buildingId}/draw-cycles/${draw.id}/cancel`, { method: "POST", body: JSON.stringify({ reason, confirmed: true }) }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Cancellation failed"); }
  }
  async function showDetails(draw: LotteryDraw) {
    setError("");
    try { setDetails(await apiRequest<DrawDetails>(`/buildings/${buildingId}/draws/${draw.id}`)); }
    catch (err) { setError(err instanceof Error ? err.message : "Draw details could not be loaded."); }
  }
  const download = (draw: LotteryDraw, kind: string) => authenticatedDownload(`/buildings/${buildingId}/draws/${draw.id}/${kind}`, `${draw.draw_reference}-${kind}`);

  return <div className="space-y-5">
    <header className="overflow-hidden rounded-xl border border-sand bg-white shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-cream via-white to-sage-light p-5 sm:p-6">
        <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-earth">Official allocation archive</p><h2 className="mt-2 text-2xl font-bold text-navy sm:text-3xl">Lottery Draw History</h2><p className="mt-2 text-sm text-slate-600">Traceable draw cycles for {buildingName}, including their mode, record counts, and locked outcome.</p></div>
        <button className="focus-ring inline-flex items-center gap-2 rounded-lg bg-earth px-4 py-2.5 font-bold text-white hover:bg-forest" onClick={() => setCreating(true)} type="button"><Plus aria-hidden="true" className="h-4 w-4" />Create New Draw Cycle</button>
      </div>
    </header>
    {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 font-semibold text-red-700" role="alert">{error}</p> : null}
    {draws.length === 0 ? <section className="rounded-xl border border-dashed border-sage bg-cream p-8 text-center"><Archive aria-hidden="true" className="mx-auto h-8 w-8 text-earth" /><h3 className="mt-3 text-lg font-bold text-navy">No draw records yet</h3><p className="mt-1 text-sm text-slate-600">Create a new draw cycle when the building is ready for allocation.</p></section> : <section className="space-y-4">
      {draws.map((draw) => <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-soft transition hover:border-sage" key={draw.id}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-xl font-bold text-navy">Draw {draw.draw_number}</h3><StatusPill label={draw.status} tone={statusTone(draw.status)} /><StatusPill label={draw.lottery_mode || "Full Allocation"} tone={draw.lottery_mode === "Competitive Lottery" ? "purple" : "green"} /></div><p className="mt-2 font-semibold text-earth">{draw.draw_name}</p><p className="mt-1 text-sm text-slate-600">{draw.draw_reference}{draw.phase_name ? ` · ${draw.phase_name}` : ""}</p></div><div className="flex items-center gap-2 rounded-lg bg-cream px-3 py-2 text-sm text-slate-600 ring-1 ring-slate-200"><CalendarDays aria-hidden="true" className="h-4 w-4 text-earth" /><span>{draw.completed_at ? new Date(draw.completed_at).toLocaleString() : "Awaiting completion"}</span></div></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">{[["Eligible residents", draw.total_eligible ?? draw.total_verified_residents], ["Available rooms", draw.total_available_rooms], ["Winners", draw.total_allocated], ["Not selected", draw.total_not_selected ?? draw.total_unallocated], ["Waiting list", draw.total_waiting_list ?? 0], ["Fairness score", `${draw.fairness_score}%`]].map(([label, value]) => <div className="rounded-lg border border-slate-200 bg-cream/60 p-3" key={String(label)}><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-lg font-bold text-navy">{value}</p></div>)}</div>
        <p className="mt-3 text-sm text-slate-600">Registered: {draw.total_residents} · Ineligible: {draw.total_not_eligible ?? "Not recorded"} · Criteria version: {draw.rule_snapshot_version ?? "Fallback / legacy"} · Seed: {draw.lottery_seed || "Pending"}</p>
        <div className="mt-5 flex flex-wrap gap-2">{draw.status === "Preparing" ? <><button className="focus-ring rounded-lg bg-sage-light px-3 py-2 text-sm font-bold text-forest hover:bg-sage" onClick={() => setup(draw.id)} type="button">Continue Setup</button><button className="focus-ring rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50" onClick={() => void cancel(draw)} type="button">Cancel Cycle</button></> : null}{draw.status === "Ready" ? <><button className="focus-ring rounded-lg bg-sage-light px-3 py-2 text-sm font-bold text-forest hover:bg-sage" onClick={() => setup(draw.id)} type="button">Review Eligibility</button><button className="focus-ring inline-flex items-center gap-2 rounded-lg bg-earth px-3 py-2 text-sm font-bold text-white hover:bg-forest" onClick={() => openLottery(draw.id)} type="button"><PlayCircle aria-hidden="true" className="h-4 w-4" />Start Draw</button><button className="focus-ring rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50" onClick={() => void cancel(draw)} type="button">Cancel Cycle</button></> : null}{draw.status === "Completed" ? <><button className="focus-ring rounded-lg bg-sage-light px-3 py-2 text-sm font-bold text-forest hover:bg-sage" onClick={() => void showDetails(draw)} type="button">View Results</button><button className="focus-ring rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-cream" onClick={() => void download(draw, "report.csv")} type="button">Download CSV</button><button className="focus-ring rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-cream" onClick={() => void download(draw, "report.pdf")} type="button">Download PDF</button><button className="focus-ring inline-flex items-center gap-2 rounded-lg border border-sage bg-sage-light/50 px-3 py-2 text-sm font-bold text-forest hover:bg-sage-light" onClick={() => void download(draw, "certificate.pdf")} type="button"><FileCheck2 aria-hidden="true" className="h-4 w-4" />Certificate</button></> : null}{draw.status === "Cancelled" ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">Cancellation: {draw.cancellation_reason}</p> : null}</div>
      </article>)}
    </section>}
    {creating ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form className="max-h-[94vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-xl bg-white p-6 shadow-soft" onSubmit={create}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-earth">New official cycle</p><h3 className="mt-1 text-2xl font-bold text-navy">Create New Draw Cycle</h3></div><button aria-label="Close" className="focus-ring rounded-lg p-2 text-slate-500 hover:bg-cream" onClick={() => setCreating(false)} type="button"><X aria-hidden="true" className="h-5 w-5" /></button></div><label className="block text-sm font-semibold text-slate-700">Draw Name<input className="focus-ring mt-1 w-full rounded-lg border px-3 py-2" required value={form.draw_name} onChange={(event) => setForm({ ...form, draw_name: event.target.value })} /></label><label className="block text-sm font-semibold text-slate-700">Lottery Mode<select aria-label="Lottery Mode" className="focus-ring mt-1 w-full rounded-lg border px-3 py-2" value={form.lottery_mode} onChange={(event) => setForm({ ...form, lottery_mode: event.target.value, waiting_list_enabled: event.target.value === "Competitive Lottery" ? form.waiting_list_enabled : false })}><option>Full Allocation</option><option>Competitive Lottery</option></select></label>{form.lottery_mode === "Competitive Lottery" ? <label className="flex items-center gap-2 rounded-lg border border-mustard bg-orange-50 p-3 text-sm font-semibold text-orange-800"><input aria-label="Enable Waiting List" checked={form.waiting_list_enabled} onChange={(event) => setForm({ ...form, waiting_list_enabled: event.target.checked })} type="checkbox" />Enable deterministic waiting list</label> : null}<label className="block text-sm font-semibold text-slate-700">Phase Name <span className="font-normal">(optional)</span><input className="focus-ring mt-1 w-full rounded-lg border px-3 py-2" value={form.phase_name} onChange={(event) => setForm({ ...form, phase_name: event.target.value })} /></label><label className="block text-sm font-semibold text-slate-700">Reason for New Draw<textarea className="focus-ring mt-1 w-full rounded-lg border px-3 py-2" required value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label><label className="block text-sm font-semibold text-slate-700">Planned Draw Date<input className="focus-ring mt-1 w-full rounded-lg border px-3 py-2" type="date" value={form.planned_draw_date} onChange={(event) => setForm({ ...form, planned_draw_date: event.target.value })} /></label><label className="block text-sm font-semibold text-slate-700">Notes<textarea className="focus-ring mt-1 w-full rounded-lg border px-3 py-2" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label><div className="flex justify-end gap-3"><button className="focus-ring rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-cream" onClick={() => setCreating(false)} type="button">Cancel</button><button className="focus-ring rounded-lg bg-earth px-4 py-2 font-bold text-white hover:bg-forest" type="submit">Create Cycle</button></div></form></div> : null}
    {details ? <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4 sm:p-8"><section className="mx-auto max-w-5xl rounded-xl bg-white p-6 shadow-soft"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-earth">Locked draw result</p><h3 className="mt-1 text-2xl font-bold text-navy">{details.draw.draw_reference}</h3><p className="mt-2 text-sm text-slate-600">{details.draw.lottery_mode || "Full Allocation"} · Winners {details.draw.total_allocated} · Not Selected {details.draw.total_not_selected ?? details.draw.total_unallocated} · Waiting List {details.draw.total_waiting_list ?? 0}</p></div><button aria-label="Close draw details" className="focus-ring rounded-lg p-2 text-slate-500 hover:bg-cream" onClick={() => setDetails(null)} type="button"><X aria-hidden="true" className="h-5 w-5" /></button></div>{details.eligibility_snapshot ? <section className="mt-5 rounded-lg border border-sage bg-sage-light/40 p-4"><h4 className="font-bold text-navy">Eligibility criteria at this draw</h4><p className="mt-1 text-sm text-slate-700">{details.eligibility_snapshot.rule_set?.name ?? "Verification and consent fallback"} · Version {details.eligibility_snapshot.rule_set?.version ?? "fallback"} · Eligible {details.eligibility_snapshot.summary.total_eligible} · Ineligible {details.eligibility_snapshot.summary.total_ineligible}</p><ul className="mt-2 list-disc pl-5 text-sm text-slate-600">{details.eligibility_snapshot.rule_set?.rules.filter(rule => rule.is_active).map(rule => <li key={rule.id}>{rule.rule_name}: {rule.field_name} {rule.operator} {rule.comparison_value ?? ""}{rule.category === "PRIORITY" ? ` (+${rule.priority_points} points)` : ""}</li>)}</ul></section> : null}<div className="mt-6 grid gap-4 md:grid-cols-3">{["Winner", "Allocated", "Not Selected", "Waiting List"].map((status) => { const rows = details.allocations.filter((allocation) => allocation.allocation_status === status); if (rows.length === 0) return null; const toneClass = status === "Waiting List" ? "border-mustard bg-orange-50" : status === "Not Selected" ? "border-sand bg-cream" : "border-sage bg-sage-light/45"; return <section className={`rounded-xl border p-4 ${toneClass}`} key={status}><h4 className="font-bold text-navy">{status}s <span className="text-slate-500">({rows.length})</span></h4><div className="mt-3 space-y-2">{rows.map((allocation) => <article className="rounded-lg bg-white p-3 ring-1 ring-slate-200" key={allocation.id}><p className="font-semibold text-navy">{allocation.resident_name_snapshot}</p><p className="mt-1 text-sm text-slate-600">{allocation.allocated_room_snapshot || "No room allocated"}{allocation.waiting_list_position ? ` · Position ${allocation.waiting_list_position}` : ""}</p></article>)}</div></section>; })}</div></section></div> : null}
  </div>;
}
