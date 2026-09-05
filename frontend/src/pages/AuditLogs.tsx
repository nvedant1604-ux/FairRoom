import {
  Ban,
  CheckCircle2,
  DoorOpen,
  Download,
  FileClock,
  FileText,
  PlayCircle,
  UserCheck,
  UserPlus,
  UserX
} from "lucide-react";

import { EmptyState } from "../components/EmptyState";
import { StatusPill } from "../components/StatusPill";
import type { AuditLog } from "../types";

interface AuditLogsProps {
  audits: AuditLog[];
}

function auditBadge(action: string) {
  if (action === "Resident added") return { label: "Resident Added", tone: "blue" as const, icon: UserPlus };
  if (action === "Document verified") return { label: "Resident Verified", tone: "green" as const, icon: UserCheck };
  if (action === "Document rejected") return { label: "Resident Rejected", tone: "red" as const, icon: UserX };
  if (action === "Room added") return { label: "Room Added", tone: "blue" as const, icon: DoorOpen };
  if (action === "Lottery started") return { label: "Lottery Started", tone: "orange" as const, icon: PlayCircle };
  if (action === "Lottery completed") return { label: "Lottery Completed", tone: "green" as const, icon: CheckCircle2 };
  if (action === "Admin override attempted") return { label: "Edit Blocked", tone: "red" as const, icon: Ban };
  if (action === "Report downloaded") return { label: "Report Downloaded", tone: "purple" as const, icon: Download };
  return { label: action, tone: "slate" as const, icon: FileText };
}

export function AuditLogs({ audits }: AuditLogsProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-purple-700">Audit trail</p>
          <h2 className="mt-2 text-2xl font-bold text-navy">Every important action is recorded</h2>
          <p className="mt-2 text-sm text-slate-600">
            Transparent history for resident changes, room setup, lottery locks, report downloads, and blocked edits.
          </p>
        </div>
        <StatusPill label={`${audits.length} audit entries`} tone="purple" />
      </div>
      {audits.length === 0 ? (
        <div className="mt-5">
          <EmptyState title="No audit entries" detail="Resident, room, verification, and lottery actions will appear here." />
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {audits.map((audit) => {
            const badge = auditBadge(audit.action);
            const Icon = badge.icon;
            return (
              <article key={audit.id} className="rounded-lg border border-slate-200 p-4 transition hover:border-blue-200 hover:bg-slate-50">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-700 ring-1 ring-purple-100">
                      <Icon aria-hidden="true" className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill label={badge.label} tone={badge.tone} />
                        <h3 className="font-bold text-navy">{audit.action}</h3>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{audit.details}</p>
                      {audit.reason ? <p className="mt-1 text-sm font-semibold text-orange-700">Reason: {audit.reason}</p> : null}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 text-left text-sm text-slate-500 ring-1 ring-slate-200 sm:text-right">
                    <div className="flex items-center gap-2 sm:justify-end">
                      <FileClock aria-hidden="true" className="h-4 w-4" />
                      <p>{new Date(audit.timestamp).toLocaleString()}</p>
                    </div>
                    <p className="mt-1 font-semibold text-slate-700">{audit.performed_by}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
