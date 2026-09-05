import { useEffect, useState } from "react";
import {
  ClipboardCheck,
  Clock3,
  Database,
  FileText,
  KeyRound,
  Lock,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Users
} from "lucide-react";

import { EmptyState } from "../components/EmptyState";
import { StatusPill } from "../components/StatusPill";
import { apiRequest } from "../lib/api";
import type { Allocation, DashboardStats, DrawCycleDetails, LotteryDraw } from "../types";

interface LotteryDrawProps {
  buildingId: number;
  buildingName: string;
  stats: DashboardStats | null;
  allocations: Allocation[];
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

const drawSteps = [
  {
    title: "Step 1: Verify Residents",
    detail: "Only verified residents with consent are included.",
    icon: Users
  },
  {
    title: "Step 2: Add Rooms",
    detail: "Only rooms marked Available can enter the draw.",
    icon: ClipboardCheck
  },
  {
    title: "Step 3: Lock Data",
    detail: "Resident and room lists are frozen for transparency.",
    icon: Lock
  },
  {
    title: "Step 4: Start Transparent Lottery",
    detail: "A fixed seed shuffles eligible residents and available rooms.",
    icon: Sparkles
  },
  {
    title: "Step 5: Generate Report",
    detail: "Results, explanations, seed, and audit entries are saved.",
    icon: FileText
  }
];

export function LotteryDraw({ buildingId, buildingName, stats, allocations, isAdmin, onRefresh }: LotteryDrawProps) {
  const [confirming, setConfirming] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [completedSeed, setCompletedSeed] = useState<string | null>(stats?.lottery_seed ?? null);
  const [error, setError] = useState<string | null>(null);
  const [activeCycle,setActiveCycle]=useState<LotteryDraw|null>(null);
  const [cycleDetails,setCycleDetails]=useState<DrawCycleDetails|null>(null);
  useEffect(()=>{apiRequest<LotteryDraw[]>(`/buildings/${buildingId}/draws`).then(rows=>setActiveCycle(rows.find(d=>["Preparing","Ready","In Progress"].includes(d.status))??null)).catch(()=>setActiveCycle(null))},[buildingId]);
  useEffect(()=>{if(activeCycle) apiRequest<DrawCycleDetails>(`/buildings/${buildingId}/draw-cycles/${activeCycle.id}/eligibility`).then(setCycleDetails).catch(()=>setCycleDetails(null));else setCycleDetails(null)},[activeCycle,buildingId]);

  async function runLottery() {
    if (verifiedReady < 1) {
      setError("Verify at least one resident before starting the lottery.");
      setConfirming(false);
      return;
    }
    if ((stats?.available_rooms ?? 0) < 1) {
      setError("Add at least one available room before starting the lottery.");
      setConfirming(false);
      return;
    }
    setConfirming(false);
    setRunning(true);
    setMessage(null);
    setError(null);
    setProgress(8);

    try {
      for (let step = 5; step >= 1; step -= 1) {
        setCountdown(step);
        setProgress(15 + (5 - step) * 12);
        await wait(520);
      }
      setCountdown(null);
      setProgress(78);
      const result = await apiRequest<{
        lottery_seed: string;
        fairness_score: number;
        message: string;
        allocations_created: number;
      }>(activeCycle?.status==="Ready"?`/buildings/${buildingId}/draw-cycles/${activeCycle.id}/draw`:`/buildings/${buildingId}/lottery/draw`, { method: "POST" });
      setProgress(100);
      setCompletedSeed(result.lottery_seed);
      setMessage(`${result.message} Fairness score: ${result.fairness_score}%.`);
      await onRefresh();
    } catch (err) {
      setCountdown(null);
      setError(err instanceof Error ? err.message : "Lottery could not be started.");
    } finally {
      setRunning(false);
    }
  }

  const verifiedReady = stats ? stats.verified_residents ?? stats.total_residents - stats.pending_verification : 0;
  const alreadyRun = activeCycle ? activeCycle.status!=="Ready" : allocations.length > 0 || Boolean(stats?.lottery_locked);
  const seedToShow = completedSeed ?? stats?.lottery_seed;
  const competitive=activeCycle?.lottery_mode==="Competitive Lottery";
  const expectedWinners=cycleDetails?.totals.expected_winners??Math.min(verifiedReady,stats?.available_rooms??0);
  const expectedNonWinners=cycleDetails?.totals.expected_non_winners??Math.max(0,verifiedReady-expectedWinners);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-lg border border-orange-100 bg-white shadow-soft">
        <div className="bg-gradient-to-r from-orange-50 via-white to-blue-50 p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-lottery">Transparent lottery draw</p>
              <h2 className="mt-2 text-2xl font-bold text-navy sm:text-3xl">Start AI-powered fair allocation</h2>
              <p className="mt-2 font-semibold text-orange-800">Lottery Draw for: {buildingName}</p>
              {activeCycle ? <p className="mt-1 font-bold text-blue-700">Draw {activeCycle.draw_number} · {activeCycle.draw_reference} · {activeCycle.draw_name} · {activeCycle.status}</p> : null}
              <p className="mt-2 max-w-3xl text-slate-600">
                The draw locks verified residents and available rooms, generates a seed, then creates auditable allocations.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusPill label={`${verifiedReady} verified residents`} tone="green" />
              <StatusPill label={`${stats?.available_rooms ?? 0} available rooms`} tone="blue" />
              <StatusPill label={stats?.lottery_locked ? "Lottery Locked" : "Lottery Unlocked"} tone={stats?.lottery_locked ? "orange" : "green"} />
            </div>
          </div>
        </div>
      </section>

      {competitive ? <section className="rounded-lg border border-purple-200 bg-purple-50 p-5"><h3 className="font-bold text-purple-900">Competitive Lottery Summary</h3><p className="mt-1 text-sm text-purple-800">All eligible residents may participate. The system will select winners up to the number of available rooms.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Eligible Residents",cycleDetails?.totals.included_residents??0],["Available Rooms",cycleDetails?.totals.included_rooms??0],["Expected Winners",expectedWinners],["Expected Non-Winners",expectedNonWinners]].map(([label,value])=><div className="rounded-lg bg-white p-3" key={String(label)}><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-navy">{value}</p></div>)}</div><p className="mt-3 text-sm font-semibold text-purple-900">Waiting List: {activeCycle?.waiting_list_enabled?"Enabled":"Disabled"}</p></section> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {drawSteps.map((step, index) => {
          const Icon = step.icon;
          return (
            <article key={step.title} className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-sm font-bold text-orange-700">
                  {index + 1}
                </span>
                <Icon aria-hidden="true" className="h-5 w-5 text-navy" />
              </div>
              <h3 className="mt-4 font-bold text-navy">{step.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{step.detail}</p>
            </article>
          );
        })}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
        <div className="grid gap-5 lg:grid-cols-[0.82fr_1.18fr]">
          <div>
            <h3 className="text-xl font-bold text-navy">Draw Control</h3>
            <p className="mt-2 text-sm text-slate-600">
              Once the lottery starts, resident and room data will be locked for transparency.
            </p>
            <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm font-semibold text-orange-800">
              Warning: after the lock, edit attempts are blocked and written to the audit trail.
            </div>
            <button
              className="focus-ring mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-3 font-semibold text-white shadow-soft hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-400 sm:w-auto"
              disabled={!isAdmin || running || alreadyRun}
              onClick={() => setConfirming(true)}
              type="button"
            >
              <PlayCircle aria-hidden="true" className="h-5 w-5" />
              Start Lottery Draw
            </button>
            {!isAdmin ? (
              <p className="mt-3 text-sm font-semibold text-orange-700">Admin login is required to start the draw.</p>
            ) : null}
            {alreadyRun ? (
              <p className="mt-3 text-sm font-semibold text-green-700">
                Lottery is locked. Existing allocations are protected from manual changes.
              </p>
            ) : null}
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-4 border-orange-200 bg-white text-4xl font-black text-orange-600 shadow-soft">
                {countdown ?? (progress === 100 ? "OK" : <Sparkles aria-hidden="true" className="h-9 w-9" />)}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-navy">Live draw status</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {countdown ? `Transparent lottery starts in ${countdown}` : running ? "Generating locked allocations..." : progress === 100 ? "Lottery completed." : "Ready for confirmation."}
                </p>
                <div className="mt-4 h-4 overflow-hidden rounded-full bg-white ring-1 ring-slate-200">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-500 to-green-600 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                <Clock3 aria-hidden="true" className="h-5 w-5 text-blue-700" />
                <p className="mt-2 text-sm font-semibold text-navy">Timestamped</p>
              </div>
              <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                <KeyRound aria-hidden="true" className="h-5 w-5 text-orange-700" />
                <p className="mt-2 text-sm font-semibold text-navy">Seed stored</p>
              </div>
              <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                <ShieldCheck aria-hidden="true" className="h-5 w-5 text-green-700" />
                <p className="mt-2 text-sm font-semibold text-navy">No override</p>
              </div>
            </div>
            {seedToShow ? (
              <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Lottery seed</p>
                <p className="mt-1 break-all font-mono text-sm font-bold text-navy">{seedToShow}</p>
              </div>
            ) : null}
          </div>
        </div>
        {error ? (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="mt-5 rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-700">
            {message}
          </div>
        ) : null}
      </section>

      {allocations.length === 0 ? (
        <EmptyState title="No draw results yet" detail="Results will appear here and on the Allocation Results page after the lottery completes." />
      ) : (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
          <h3 className="text-xl font-bold text-navy">Recent generated allocations</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {allocations.slice(0, 4).map((allocation) => (
              <article key={allocation.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-navy">{allocation.full_name}</p>
                  <StatusPill label={allocation.new_room_number} tone="green" />
                </div>
                <p className="mt-2 text-sm text-slate-600">{allocation.allocation_reason}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {confirming ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-soft">
            <div className="flex items-start gap-3">
              <Database aria-hidden="true" className="mt-1 h-6 w-6 text-orange-600" />
              <div>
                <h3 className="text-xl font-bold text-navy">Confirm locked lottery draw</h3>
                <p className="mt-3 text-sm text-slate-600">
                  {competitive ? `This will select ${expectedWinners} winner${expectedWinners===1?"":"s"} and record ${expectedNonWinners} non-winner result${expectedNonWinners===1?"":"s"} using the locked seeded process.` : "This will lock resident and room lists, generate a lottery seed, run the transparent algorithm, and create audit entries."}
                </p>
              </div>
            </div>
            <div className="mt-5 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
              Once the lottery starts, resident and room data will be locked for transparency.
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                className="focus-ring rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => setConfirming(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="focus-ring rounded-lg bg-orange-600 px-4 py-2 font-semibold text-white hover:bg-orange-700"
                onClick={runLottery}
                type="button"
              >
                Confirm and Start
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
