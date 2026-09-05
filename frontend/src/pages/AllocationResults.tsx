import { useState } from "react";
import { Award, Brain, CalendarClock, ChevronDown, Download, Printer, ShieldCheck } from "lucide-react";

import { EmptyState } from "../components/EmptyState";
import { StatusPill } from "../components/StatusPill";
import { downloadUrl } from "../lib/api";
import type { Allocation, DashboardStats } from "../types";

interface AllocationResultsProps {
  buildingId: number;
  allocations: Allocation[];
  stats: DashboardStats | null;
}

export function AllocationResults({ buildingId, allocations, stats }: AllocationResultsProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (allocations.length === 0) {
    return <EmptyState title="Allocation results are empty" detail="Run the lottery draw to generate locked allocation results." />;
  }

  const remainingRooms = stats ? stats.available_rooms : 0;
  const fairnessScore = allocations[0]?.fairness_score ?? stats?.transparency_score ?? 0;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-lg border border-green-100 bg-white shadow-soft">
        <div className="bg-gradient-to-r from-green-50 via-white to-blue-50 p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-green-700">Allocation results</p>
              <h2 className="mt-2 text-2xl font-bold text-navy sm:text-3xl">Locked allocation results</h2>
              <p className="mt-2 max-w-3xl text-slate-600">
                Each result includes old room, new room, priority category, fairness score, timestamp, and AI explanation.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusPill label={`Allocated ${allocations.length}`} tone="green" />
              <StatusPill label={`Remaining rooms ${remainingRooms}`} tone="blue" />
              <StatusPill label={`Fairness ${fairnessScore}%`} tone="purple" />
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <a
              className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800"
              href={downloadUrl(`/buildings/${buildingId}/report.csv`)}
            >
              <Download aria-hidden="true" className="h-4 w-4" />
              Export CSV
            </a>
            <button
              className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => window.print()}
              type="button"
            >
              <Printer aria-hidden="true" className="h-4 w-4" />
              Print Allocation List
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">Resident Name</th>
                <th className="px-3 py-3">Old Room</th>
                <th className="px-3 py-3">New Room</th>
                <th className="px-3 py-3">Priority</th>
                <th className="px-3 py-3">Fairness</th>
                <th className="px-3 py-3">Timestamp</th>
                <th className="px-3 py-3">AI Explanation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allocations.map((allocation) => {
                const expanded = expandedId === allocation.id;
                return (
                  <tr key={allocation.id} className="align-top">
                    <td className="px-3 py-3 font-semibold text-navy">{allocation.full_name}</td>
                    <td className="px-3 py-3">{allocation.old_room_number}</td>
                    <td className="px-3 py-3">
                      <StatusPill label={allocation.new_room_number} tone="green" />
                    </td>
                    <td className="px-3 py-3">{allocation.priority_category}</td>
                    <td className="px-3 py-3">{allocation.fairness_score}%</td>
                    <td className="px-3 py-3">{new Date(allocation.created_at).toLocaleString()}</td>
                    <td className="px-3 py-3">
                      <button
                        className="focus-ring inline-flex items-center gap-1 rounded-md border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                        onClick={() => setExpandedId(expanded ? null : allocation.id)}
                        type="button"
                      >
                        {expanded ? "Hide Explanation" : "View Explanation"}
                        <ChevronDown aria-hidden="true" className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {allocations.map((allocation) => {
          const expanded = expandedId === allocation.id;
          return (
            <article key={allocation.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <Award aria-hidden="true" className="mt-1 h-5 w-5 text-green-700" />
                  <div>
                    <h3 className="font-bold text-navy">{allocation.full_name}</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {allocation.old_room_number} to {allocation.new_room_number} - {allocation.priority_category}
                    </p>
                  </div>
                </div>
                <StatusPill label={`${allocation.fairness_score}% fair`} tone="purple" />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Old Room</p>
                  <p className="mt-1 font-bold text-navy">{allocation.old_room_number}</p>
                </div>
                <div className="rounded-lg bg-green-50 p-3 ring-1 ring-green-200">
                  <p className="text-xs font-semibold uppercase tracking-wide text-green-700">New Room</p>
                  <p className="mt-1 font-bold text-green-900">{allocation.new_room_number}</p>
                </div>
                <div className="rounded-lg bg-blue-50 p-3 ring-1 ring-blue-200">
                  <CalendarClock aria-hidden="true" className="h-4 w-4 text-blue-700" />
                  <p className="mt-1 text-sm font-semibold text-blue-900">{new Date(allocation.created_at).toLocaleString()}</p>
                </div>
              </div>
              <button
                className="focus-ring mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => setExpandedId(expanded ? null : allocation.id)}
                type="button"
              >
                <Brain aria-hidden="true" className="h-4 w-4 text-purple-700" />
                {expanded ? "Hide AI Explanation" : "View AI Explanation"}
              </button>
              {expanded ? (
                <div className="mt-4 rounded-lg border border-purple-100 bg-purple-50 p-4">
                  <div className="flex items-start gap-3">
                    <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 text-purple-700" />
                    <p className="text-sm leading-6 text-purple-900">{allocation.allocation_reason}</p>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>
    </div>
  );
}
