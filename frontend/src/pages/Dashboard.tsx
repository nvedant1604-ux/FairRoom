import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  CheckCircle2,
  DoorOpen,
  FileCheck2,
  FileText,
  Gauge,
  Home,
  LockKeyhole,
  MapPin,
  RotateCcw,
  ShieldCheck,
  UnlockKeyhole,
  Users
} from "lucide-react";

import { EmptyState } from "../components/EmptyState";
import { BuildingLocationLoading, BuildingLocationSection } from "../components/BuildingLocationSection";
import { StatCard } from "../components/StatCard";
import { StatusPill } from "../components/StatusPill";
import { getLotteryStatus } from "../lib/lotteryStatus";
import type { Allocation, DashboardStats, DemoResetResponse, LotteryDraw } from "../types";
import { useBuilding } from "../context/BuildingContext";
import { apiRequest, authenticatedDownload, downloadUrl } from "../lib/api";

interface DashboardProps {
  stats: DashboardStats | null;
  allocations: Allocation[];
  loading: boolean;
  isAdmin: boolean;
  onDemoReset: () => Promise<DemoResetResponse>;
  onAdminLogin: () => void;
}

export function Dashboard({ stats, allocations, loading, isAdmin, onDemoReset, onAdminLogin }: DashboardProps) {
  const { buildings, selectedBuilding, selectBuilding, archiveBuilding } = useBuilding();
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [historyDraws,setHistoryDraws]=useState<LotteryDraw[]>([]);
  useEffect(()=>{if(stats?.building?.id)apiRequest<LotteryDraw[]>(`/buildings/${stats.building.id}/draws`).then(setHistoryDraws).catch(()=>setHistoryDraws([]));else setHistoryDraws([]);},[stats?.building?.id]);
  const openPath=(path:string)=>{window.history.pushState({},"",path);window.dispatchEvent(new PopStateEvent("popstate"));};

  if (loading && !stats) {
    return (
      <div className="space-y-6">
        <EmptyState title="Loading dashboard" detail="Connecting to the lottery backend and reading current data." />
        {selectedBuilding ? <BuildingLocationLoading buildingName={selectedBuilding.building_name} /> : null}
      </div>
    );
  }

  if (!stats) {
    return <EmptyState title="Dashboard unavailable" detail="Start the backend API to load society and lottery data." />;
  }

  const issueCount =
    stats.issues.aadhaar_duplicates.length +
    stats.issues.old_room_duplicates.length +
    stats.issues.invalid_priority.length +
    stats.issues.suspicious.length;
  const verifiedResidents = stats.verified_residents ?? stats.total_residents - stats.pending_verification;
  const totalRooms = stats.total_rooms ?? stats.available_rooms + stats.allocated_rooms;
  const roomsReady = stats.available_rooms > 0 || stats.allocated_rooms > 0;
  const reportsAvailable = allocations.length > 0;
  const lastDrawDate = stats.lottery_completed_at
    ? new Date(stats.lottery_completed_at).toLocaleString()
    : "Not completed yet";
  const lotteryStatus = getLotteryStatus(stats);
  const activeCompetitive = historyDraws.find((draw) => draw.lottery_mode === "Competitive Lottery" && ["Preparing", "Ready", "In Progress"].includes(draw.status));
  const potentialWinners = activeCompetitive ? Math.min(activeCompetitive.total_eligible ?? 0, activeCompetitive.total_available_rooms) : 0;
  const potentialNonWinners = activeCompetitive ? Math.max(0, (activeCompetitive.total_eligible ?? 0) - potentialWinners) : 0;

  async function confirmDemoReset() {
    setResetting(true);
    setResetError(null);
    setResetMessage(null);
    try {
      const result = await onDemoReset();
      setResetMessage(result.message);
      setResetOpen(false);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Demo data could not be reset.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-6">
      {resetMessage ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-700">
          <CheckCircle2 aria-hidden="true" className="mr-2 inline h-4 w-4" />
          {resetMessage}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-sage bg-white shadow-soft">
        <div className="border-b border-sage bg-gradient-to-r from-cream via-white to-sage-light p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sage bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-earth shadow-sm">
                <Building2 aria-hidden="true" className="h-4 w-4" />
                FairRoom
              </div>
              <h2 className="mt-3 text-2xl font-bold text-navy sm:text-3xl">
                Housing Allocation Control Center
              </h2>
              <p className="mt-1 text-sm font-medium text-slate-600">Fair, transparent and auditable room allocation.</p>
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                <span className="inline-flex items-center gap-1">
                  <Home aria-hidden="true" className="h-4 w-4 text-earth" />
                  {stats.society?.name ?? "Society"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin aria-hidden="true" className="h-4 w-4 text-green-700" />
                  {stats.society?.address ?? "Project address pending"}
                </span>
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
              <div className="flex flex-wrap gap-2">
                <StatusPill label={lotteryStatus.title} tone={lotteryStatus.kind === "ready" ? "green" : lotteryStatus.kind === "setup" ? "orange" : "blue"} />
              </div>
              <button
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 shadow-sm hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                disabled={!isAdmin || resetting}
                onClick={() => setResetOpen(true)}
                type="button"
              >
                <RotateCcw aria-hidden="true" className="h-4 w-4" />
                Reset Selected Building
              </button>
              {!isAdmin ? (
                <div className="flex items-center gap-3 text-xs font-semibold text-slate-700 sm:basis-full lg:justify-end">
                  <span>DEMO ONLY reset requires admin login.</span>
                  <button className="text-earth underline hover:text-forest" onClick={onAdminLogin} type="button">Admin Login</button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="grid gap-0 divide-y divide-slate-100 p-5 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
          {[
            ["Society Name", stats.society?.name ?? "Not configured"],
            ["Project Name", stats.society?.redevelopment_project_name ?? "Not configured"],
            ["Address", stats.society?.address ?? "Not configured"],
            ["Last Lottery Draw", lastDrawDate]
          ].map(([label, value]) => (
            <div key={label} className="py-3 sm:px-4 sm:py-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-1 text-sm font-bold text-navy">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-sage bg-sage-light/70 p-4 text-forest">
        <p className="font-bold">{lotteryStatus.title}</p>
        <p className="mt-1 text-sm font-medium">{lotteryStatus.message}</p>
        {stats.lottery_completed_at ? <p className="mt-1 text-sm">Completed: {lastDrawDate}</p> : null}
      </section>

      {activeCompetitive ? <section className="rounded-xl border border-clay/50 bg-sand/45 p-5"><p className="font-bold text-terracotta-dark">Competitive Lottery</p><p className="mt-1 text-sm text-slate-700">{activeCompetitive.draw_name} · all selected eligible residents may participate.</p><div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">{[["Eligible Residents",activeCompetitive.total_eligible??0],["Available Rooms",activeCompetitive.total_available_rooms],["Potential Winners",potentialWinners],["Potential Non-Winners",potentialNonWinners]].map(([label,value])=><div className="rounded-lg bg-white p-3" key={String(label)}><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="text-2xl font-bold text-navy">{value}</p></div>)}</div></section> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          {
            title: "Residents Verified",
            value: `${verifiedResidents}/${stats.total_residents}`,
            detail: "Only verified residents enter the draw.",
            icon: BadgeCheck,
            tone: "green" as const
          },
          {
            title: "Rooms Ready",
            value: roomsReady ? `${stats.available_rooms} open` : "Not ready",
            detail: `${totalRooms} total rooms are registered.`,
            icon: DoorOpen,
            tone: "blue" as const
          },
          {
            title: "Lottery Status",
            value: lotteryStatus.title,
            detail: lotteryStatus.message,
            icon: stats.lottery_locked ? LockKeyhole : UnlockKeyhole,
            tone: stats.lottery_locked ? ("orange" as const) : ("blue" as const)
          },
          {
            title: "Transparency Score",
            value: `${stats.transparency_score}%`,
            detail: "Fairness checks across data quality.",
            icon: Gauge,
            tone: "green" as const
          },
          {
            title: "Reports Available",
            value: reportsAvailable ? "Ready" : "Pending",
            detail: reportsAvailable ? "Certificate and exports are ready." : "Run lottery to unlock reports.",
            icon: FileText,
            tone: reportsAvailable ? ("purple" as const) : ("orange" as const)
          }
        ].map((item) => (
          <StatCard key={item.title} {...item} />
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard
          title="Total Residents"
          value={stats.total_residents}
          detail="Registered residents in the redevelopment project."
          tone="blue"
          icon={Users}
        />
        <StatCard
          title="Total Rooms"
          value={totalRooms}
          detail={`${stats.available_rooms} available and ${stats.allocated_rooms} allocated.`}
          tone="green"
          icon={DoorOpen}
        />
        <StatCard
          title="Allocated Rooms"
          value={stats.allocated_rooms}
          detail="Rooms assigned through the auditable draw."
          tone="orange"
          icon={CheckCircle2}
        />
        <StatCard
          title="Transparency Score"
          value={`${stats.transparency_score}%`}
          detail="AI fairness checks across duplicate, verification, and room data."
          tone="green"
          icon={Gauge}
        />
        <StatCard
          title="Pending Verification"
          value={stats.pending_verification}
          detail="Residents waiting for document verification."
          tone="orange"
          icon={FileCheck2}
        />
        <StatCard
          title="Fairness Status"
          value={issueCount === 0 ? "Clear" : "Review"}
          detail={issueCount === 0 ? "No duplicate or suspicious records found." : `${issueCount} fairness warnings need review.`}
          tone={issueCount === 0 ? "green" : "purple"}
          icon={ShieldCheck}
        />
      </section>

      {stats.building ? <BuildingLocationSection building={stats.building} isAdmin={isAdmin} /> : null}

      <section className="rounded-xl border border-sand bg-sand/35 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-xl font-bold text-navy">Permanent Allocation Archive</h3><button className="rounded-lg bg-earth px-4 py-2 font-bold text-white hover:bg-forest" onClick={()=>openPath("/draw-history?create=1")}>Create New Draw Cycle</button></div><p className="mt-2">{stats.total_residents} residents registered · {historyDraws.filter(d=>d.status==="Completed").length} completed draws · {historyDraws.reduce((n,d)=>n+d.total_allocated,0)} historical allocations · Latest fairness {historyDraws[0]?.fairness_score??"—"}%</p><div className="mt-3 flex flex-wrap gap-3"><button className="font-bold text-earth hover:text-forest" onClick={()=>openPath("/resident-history")}>View Resident History</button><button className="font-bold text-earth hover:text-forest" onClick={()=>openPath("/draw-history")}>View Draw History</button>{historyDraws[0]?<a className="font-bold text-green-700" href={downloadUrl(`/buildings/${stats.building?.id}/draws/${historyDraws[0].id}/certificate.pdf`)} onClick={event=>{event.preventDefault();void authenticatedDownload(`/buildings/${stats.building?.id}/draws/${historyDraws[0].id}/certificate.pdf`,"latest-draw-certificate.pdf");}}>Download Latest Certificate</a>:null}</div></section>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft"><h3 className="text-xl font-bold text-navy">My Buildings</h3><div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{buildings.map((building)=><article key={building.id} className="rounded-lg border p-4"><h4 className="font-bold text-navy">{building.building_name}</h4><p className="text-sm text-slate-600">{building.society_name}</p><p className="mt-1 text-sm text-slate-500">{building.full_address}</p><p className="mt-2 text-xs font-semibold">{building.resident_count??0} residents · {building.room_count??0} rooms · {building.lottery_locked?"Lottery Locked":building.status}</p><div className="mt-3 flex gap-2"><button className="text-sm font-bold text-earth hover:text-forest" onClick={()=>selectBuilding(building.id)}>Open Dashboard</button>{isAdmin?<><button className="text-sm font-bold text-slate-700" onClick={()=>window.dispatchEvent(new CustomEvent("edit-building",{detail:building.id}))}>Edit</button><button className="text-sm font-bold text-red-700" onClick={()=>void archiveBuilding(building.id)}>Archive</button></>:null}</div></article>)}</div></section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
          <h3 className="text-lg font-bold text-navy">Fairness Engine Summary</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-green-100 bg-green-50 p-4">
              <p className="font-semibold text-green-800">AI role is transparent</p>
              <p className="mt-1 text-sm text-green-700">
                AI validates data, flags risk, explains decisions, and builds audit reports. It does not secretly select rooms.
              </p>
            </div>
            <div className="rounded-lg border border-orange-100 bg-orange-50 p-4">
              <p className="font-semibold text-orange-800">Lottery algorithm is locked</p>
              <p className="mt-1 text-sm text-orange-700">
                Verified residents and available rooms are shuffled through a stored seed for later verification.
              </p>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-slate-200 p-4">
            <p className="text-sm font-semibold text-navy">Security and ethics disclaimer</p>
            <p className="mt-1 text-sm text-slate-600">
              This system supports transparent allocation but final legal approval depends on society, builder, and redevelopment authority rules.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-navy">Latest Allocations</h3>
            <StatusPill label={`${allocations.length} records`} tone="blue" />
          </div>
          {allocations.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="No allocations yet" detail="Start the lottery draw after verifying residents and rooms." />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {allocations.slice(0, 5).map((allocation) => (
                <div key={allocation.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-navy">{allocation.full_name}</p>
                    <StatusPill label={allocation.new_room_number} tone="green" />
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {allocation.old_room_number} - {allocation.priority_category}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {issueCount > 0 ? (
        <section className="rounded-lg border border-orange-200 bg-orange-50 p-5">
          <div className="flex gap-3">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 text-orange-700" />
            <div>
              <h3 className="font-bold text-orange-900">AI fairness warnings found</h3>
              <p className="mt-1 text-sm text-orange-800">
                Review duplicate, invalid priority, and suspicious records before starting the locked lottery draw.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {resetOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-soft">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-700 ring-1 ring-red-100">
                <RotateCcw aria-hidden="true" className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-red-700">DEMO ONLY</p>
                <h3 className="mt-1 text-xl font-bold text-navy">Reset demo data for {stats.building?.building_name}?</h3>
                <p className="mt-3 text-sm text-slate-600">
                  This will clear residents, rooms, allocations, lottery results and audit records only for this building. Other buildings will not be changed.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
              Lottery status will return to unlocked and the Sai Darshan CHS sample data will be loaded.
            </div>

            {resetError ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                {resetError}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                className="focus-ring rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
                disabled={resetting}
                onClick={() => setResetOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-red-700 px-4 py-2 font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                disabled={resetting}
                onClick={confirmDemoReset}
                type="button"
              >
                <RotateCcw aria-hidden="true" className="h-4 w-4" />
                {resetting ? "Resetting Demo Data…" : "Reset Selected Building"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
