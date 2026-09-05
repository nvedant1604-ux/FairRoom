import { Award, Download, FileText, KeyRound, Printer, ShieldCheck } from "lucide-react";

import { EmptyState } from "../components/EmptyState";
import { StatusPill } from "../components/StatusPill";
import { downloadUrl } from "../lib/api";
import type { TransparencyReport as TransparencyReportType } from "../types";

interface TransparencyReportProps {
  buildingId: number;
  report: TransparencyReportType | null;
}

export function TransparencyReport({ buildingId, report }: TransparencyReportProps) {
  if (!report) {
    return <EmptyState title="Transparency report unavailable" detail="Start the backend API to generate the report payload." />;
  }

  const lotteryDate = report.lottery_completed_at
    ? new Date(report.lottery_completed_at).toLocaleString()
    : "Not completed yet";
  const societyName = report.society?.name ?? "Not configured";
  const projectName = report.society?.redevelopment_project_name ?? "Not configured";

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-lg border border-purple-100 bg-white shadow-soft">
        <div className="bg-gradient-to-r from-purple-50 via-white to-green-50 p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-purple-700">Transparency report</p>
              <h2 className="mt-2 text-2xl font-bold text-navy sm:text-3xl">Audit-ready project certificate</h2>
              <p className="mt-2 max-w-3xl text-slate-600">
                Includes society details, rules, seed, allocation list, fairness score, AI summary, and audit log summary.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800"
                href={downloadUrl(`/buildings/${buildingId}/report.pdf`)}
              >
                <Download aria-hidden="true" className="h-4 w-4" />
                Download PDF Report
              </a>
              <a
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
                href={downloadUrl(`/buildings/${buildingId}/report.csv`)}
              >
                <FileText aria-hidden="true" className="h-4 w-4" />
                Export CSV
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-green-200 bg-white p-5 shadow-soft sm:p-7">
        <div className="mx-auto max-w-5xl rounded-lg border border-green-200 bg-gradient-to-br from-white via-green-50 to-blue-50 p-5 shadow-soft sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-green-700 text-white shadow-soft">
                <Award aria-hidden="true" className="h-7 w-7" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-green-700">Transparency Certificate</p>
                <h3 className="mt-1 text-3xl font-black text-navy">Transparency Certificate</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
                  This allocation was generated through a locked and auditable lottery process. AI fairness checks were used to validate eligibility, detect suspicious entries, and generate explanations. No manual room selection was used.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-green-700 px-4 py-2 font-semibold text-white hover:bg-green-800"
                href={downloadUrl(`/buildings/${buildingId}/report/certificate`)}
              >
                <Download aria-hidden="true" className="h-4 w-4" />
                Download Certificate PDF
              </a>
              <button
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => window.print()}
                type="button"
              >
                <Printer aria-hidden="true" className="h-4 w-4" />
                Print Certificate
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              ["Society Name", societyName],
              ["Project Name", projectName],
              ["Lottery Date & Time", lotteryDate],
              ["Lottery Seed", report.lottery_seed],
              ["Total Residents", report.totals.total_residents],
              ["Total Rooms", report.totals.total_rooms],
              ["Total Allocated", report.totals.total_allocated],
              ["Fairness Score", `${report.totals.fairness_score}%`]
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-white/80 bg-white/85 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                <p className="mt-2 break-words text-base font-bold text-navy">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <p className="text-sm text-slate-500">Total Residents</p>
          <p className="mt-2 text-2xl font-bold text-navy">{report.totals.total_residents}</p>
        </article>
        <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <p className="text-sm text-slate-500">Total Rooms</p>
          <p className="mt-2 text-2xl font-bold text-navy">{report.totals.total_rooms}</p>
        </article>
        <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <p className="text-sm text-slate-500">Allocated</p>
          <p className="mt-2 text-2xl font-bold text-green-700">{report.totals.total_allocated}</p>
        </article>
        <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <p className="text-sm text-slate-500">Fairness Score</p>
          <p className="mt-2 text-2xl font-bold text-purple-700">{report.totals.fairness_score}%</p>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
          <h3 className="text-xl font-bold text-navy">Certificate Evidence</h3>
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex gap-3">
              <ShieldCheck aria-hidden="true" className="mt-1 h-5 w-5 text-green-700" />
              <div>
                <p className="font-semibold text-green-900">Locked and auditable</p>
                <p className="mt-1 text-sm text-green-800">
                  Allocation used a stored seed, generated audit records, and blocks post-lock edits.
                </p>
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="flex gap-3">
              <KeyRound aria-hidden="true" className="mt-1 h-5 w-5 text-blue-700" />
              <div>
                <p className="font-semibold text-blue-900">Seed</p>
                <p className="mt-1 break-all font-mono text-sm font-bold text-blue-900">{report.lottery_seed}</p>
              </div>
            </div>
          </div>
          <dl className="mt-5 space-y-3 text-sm">
            <div>
              <dt className="font-semibold text-slate-700">Society</dt>
              <dd className="text-slate-600">{societyName}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-700">Project</dt>
              <dd className="text-slate-600">{projectName}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-700">AI explanation summary</dt>
              <dd className="text-slate-600">{report.ai_explanation_summary}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
          <h3 className="text-xl font-bold text-navy">Lottery Rules</h3>
          <div className="mt-4 space-y-3">
            {report.lottery_rules.map((rule) => (
              <div key={rule} className="flex gap-3 rounded-lg border border-slate-200 p-3">
                <StatusPill label="Rule" tone="blue" />
                <p className="text-sm text-slate-600">{rule}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
        <h3 className="text-xl font-bold text-navy">Audit Log Summary</h3>
        <div className="mt-4 space-y-3">
          {report.audit_log_summary.length === 0 ? (
            <EmptyState title="No audit summary" detail="Audit entries will be listed after admin actions." />
          ) : (
            report.audit_log_summary.slice(0, 8).map((entry) => (
              <article key={`${entry.timestamp}-${entry.action}`} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                  <p className="font-semibold text-navy">{entry.action}</p>
                  <p className="text-sm text-slate-500">{new Date(entry.timestamp).toLocaleString()}</p>
                </div>
                <p className="mt-1 text-sm text-slate-600">{entry.details}</p>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
