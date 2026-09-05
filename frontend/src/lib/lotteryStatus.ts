import type { DashboardStats } from "../types";

export type LotteryStatusKind = "setup" | "unlocked" | "ready" | "running" | "completed" | "locked";

export interface LotteryStatus {
  kind: LotteryStatusKind;
  title: string;
  message: string;
  missing: string[];
}

export function getLotteryStatus(stats: DashboardStats, running = false): LotteryStatus {
  if (running) return { kind: "running", title: "Lottery In Progress", message: "Transparent allocations are being generated.", missing: [] };
  if (stats.lottery_completed_at) return { kind: "completed", title: "Lottery Completed", message: "Results and transparency reports are available. Allocation data locked for transparency.", missing: [] };
  if (stats.allocated_rooms > 0 || stats.lottery_locked) return { kind: "locked", title: "Lottery Locked", message: "Allocation data is protected from further modification.", missing: [] };

  const missing = [
    ...(stats.verified_residents < 1 ? ["No verified residents"] : []),
    ...(stats.available_rooms < 1 ? ["No available rooms"] : [])
  ];
  if (missing.length) return { kind: "setup", title: "Setup Incomplete", message: missing.join(" and ") + ".", missing };
  return { kind: "ready", title: "Ready for Transparent Draw", message: "Verified residents and available rooms are ready.", missing: [] };
}
