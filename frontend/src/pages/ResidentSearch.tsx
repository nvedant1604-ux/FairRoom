import { useState, type FormEvent } from "react";
import { Bot, Download, Home, Info, Search, ShieldCheck } from "lucide-react";

import { EmptyState } from "../components/EmptyState";
import { StatusPill } from "../components/StatusPill";
import { apiRequest, downloadUrl } from "../lib/api";
import type { ResidentSearchResult } from "../types";
import { useBuilding } from "../context/BuildingContext";

export function ResidentSearch() {
  const { buildings, selectedBuildingId, selectBuilding } = useBuilding();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<ResidentSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState("Why did I get this room?");
  const [answer, setAnswer] = useState<string | null>(null);

  async function searchResident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setAnswer(null);
    try {
      const payload = await apiRequest<ResidentSearchResult>(
        `/resident/search?building_id=${selectedBuildingId}&query=${encodeURIComponent(query)}`
      );
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No resident record found.");
    } finally {
      setLoading(false);
    }
  }

  async function askChatbot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAnswer(null);
    try {
      const payload = await apiRequest<{ answer: string }>("/chat", {
        method: "POST",
        body: JSON.stringify({
          question,
          resident_query: query || undefined, building_id: selectedBuildingId
        })
      });
      setAnswer(payload.answer);
    } catch (err) {
      setAnswer(err instanceof Error ? err.message : "The assistant could not answer right now.");
    }
  }

  function statusTone(status: string) {
    if (status === "Allocated" || status === "Verified") return "green";
    if (status === "Rejected") return "red";
    return "orange";
  }

  const allocationStatus = result?.new_room_number ? "Allocated" : result?.verification_status ?? "Not searched";

  return (
    <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Resident view</p>
        <h2 className="mt-2 text-2xl font-bold text-navy">Check allocation status</h2>
        <p className="mt-2 text-sm text-slate-600">
          Search using Aadhaar last 4 digits or old room number. Full Aadhaar is never shown.
        </p>
        <label className="mt-4 block text-sm font-semibold text-slate-700">Building/Society<select aria-label="Building/Society" className="mt-1 w-full rounded-lg border px-3 py-2" value={selectedBuildingId??""} onChange={(e)=>selectBuilding(Number(e.target.value))}>{buildings.map((b)=><option key={b.id} value={b.id}>{b.building_name} — {b.society_name}</option>)}</select></label>
        <form className="mt-5 space-y-4" onSubmit={searchResident}>
          <div>
            <label className="text-sm font-semibold text-slate-700" htmlFor="resident_query">
              Aadhaar last 4 digits or old room number
            </label>
            <input
              className="focus-ring mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              id="resident_query"
              placeholder="9012 or OLD-A-101"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              required
            />
          </div>
          <button
            className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:bg-slate-400"
            disabled={loading}
            type="submit"
          >
            <Search aria-hidden="true" className="h-4 w-4" />
            {loading ? "Searching..." : "Search Allocation"}
          </button>
        </form>

        {error ? (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-3">
            <Bot aria-hidden="true" className="h-5 w-5 text-purple-700" />
            <h3 className="font-bold text-navy">Resident Query Assistant</h3>
          </div>
          <form className="mt-4 space-y-3" onSubmit={askChatbot}>
            <input
              className="focus-ring w-full rounded-lg border border-slate-300 px-3 py-2"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="How was the lottery done?"
            />
            <button
              className="focus-ring rounded-lg bg-purple-700 px-4 py-2 font-semibold text-white hover:bg-purple-800"
              type="submit"
            >
              Ask Assistant
            </button>
          </form>
          {answer ? <p className="mt-4 rounded-lg bg-white p-3 text-sm text-slate-700 ring-1 ring-slate-200">{answer}</p> : null}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-green-700">Allocation certificate</p>
            <h2 className="mt-2 text-2xl font-bold text-navy">Resident result</h2>
          </div>
          <StatusPill label={allocationStatus} tone={statusTone(allocationStatus)} />
        </div>
        {!result ? (
          <div className="mt-5">
            <EmptyState title="No resident selected" detail="Search to view allocation status, room details, and explanation." />
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="rounded-lg border border-green-200 bg-gradient-to-r from-green-50 to-blue-50 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-navy">{result.full_name}</h3>
                  <p className="mt-1 text-sm text-slate-700">Masked Aadhaar: {result.aadhaar_masked}</p>
                </div>
                <StatusPill label={allocationStatus} tone={statusTone(allocationStatus)} />
              </div>
            </div>
            <dl className="grid gap-3 sm:grid-cols-3"><div><dt className="text-xs font-semibold text-slate-500">Building</dt><dd className="font-bold">{result.building_name}</dd></div><div><dt className="text-xs font-semibold text-slate-500">Society</dt><dd className="font-bold">{result.society_name}</dd></div><div><dt className="text-xs font-semibold text-slate-500">Project</dt><dd className="font-bold">{result.redevelopment_project_name}</dd></div></dl>

            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-4">
                <dt className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                  <Home aria-hidden="true" className="h-4 w-4" />
                  New Room Number
                </dt>
                <dd className="mt-2 text-2xl font-black text-green-700">{result.new_room_number ?? "Not allocated yet"}</dd>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <dt className="text-sm font-semibold text-slate-500">Old Room Number</dt>
                <dd className="mt-2 text-xl font-bold text-navy">{result.old_room_number}</dd>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <dt className="text-sm font-semibold text-slate-500">Priority Category</dt>
                <dd className="mt-2 text-xl font-bold text-navy">{result.priority_category}</dd>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <dt className="text-sm font-semibold text-slate-500">Fairness Score</dt>
                <dd className="mt-2 text-xl font-bold text-navy">{result.fairness_score ? `${result.fairness_score}%` : "Pending"}</dd>
              </div>
            </dl>

            <div className="rounded-lg border border-purple-100 bg-purple-50 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck aria-hidden="true" className="mt-1 h-5 w-5 text-purple-700" />
                <div>
                  <h3 className="font-bold text-purple-950">AI Explanation</h3>
                  <p className="mt-2 text-sm leading-6 text-purple-900">
                    {result.allocation_reason ?? "Allocation has not been completed yet."}
                  </p>
                </div>
              </div>
            </div>

            {result.draw_history?.length ? <div className="rounded-lg border border-blue-200 bg-blue-50 p-4"><h3 className="font-bold text-navy">Lottery Draw Participation</h3>{result.draw_history.map(draw=><article className="mt-3 rounded bg-white p-3" key={draw.draw_reference}><b>Draw {draw.draw_number}: {draw.draw_name}</b><p>{draw.draw_reference} · {draw.allocation_status} · {draw.allocated_room_snapshot||"No room allocated"}</p><p className="mt-1 text-sm text-slate-600">{draw.ai_explanation?.replace(" No manual override was used.","")}</p></article>)}</div>:null}

            <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
              <div className="flex items-start gap-3">
                <Info aria-hidden="true" className="mt-1 h-5 w-5 text-orange-700" />
                <p className="text-sm text-orange-800">
                  Disclaimer: This system supports transparent allocation, but final legal approval depends on society, builder, and redevelopment authority rules.
                </p>
              </div>
            </div>

            <a
              className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 sm:w-auto"
              href={downloadUrl(`/resident/certificate?building_id=${selectedBuildingId}&query=${encodeURIComponent(query)}`)}
            >
              <Download aria-hidden="true" className="h-4 w-4" />
              Download Allocation Certificate
            </a>
          </div>
        )}
      </section>
    </div>
  );
}
