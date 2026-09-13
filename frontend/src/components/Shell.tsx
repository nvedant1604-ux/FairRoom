import { LockKeyhole, LogOut, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import type { PageKey } from "../pages/pageTypes";
import { BuildingControls } from "./BuildingControls";
import { Sidebar } from "./Sidebar";

interface ShellProps {
  activePage: PageKey;
  activeDrawCycleId: number | null;
  isAdmin: boolean;
  isResident?: boolean;
  residentName?: string | null;
  adminEmail: string | null;
  onNavigate: (page: PageKey) => void;
  onLogout: () => void;
  children: ReactNode;
}

const pageTitles: Record<PageKey, string> = {
  dashboard: "Home Dashboard",
  residents: "Resident Registration",
  rooms: "Room Management",
  lottery: "Lottery Draw",
  results: "Allocation Results",
  audit: "Audit Logs",
  report: "Transparency Report",
  residentSearch: "Resident Search",
  residentHistory: "Resident History",
  drawHistory: "Draw History",
  drawCycleSetup: "Draw Cycle Setup",
  eligibility: "Eligibility Criteria",
  admin: "Admin Login",
  residentDashboard: "Resident Dashboard",
  residentProfile: "My Profile",
  residentEligibility: "My Eligibility",
  residentLottery: "My Lottery",
  residentAllocation: "My Allocation",
  residentHistorySelf: "My History"
};

function initialCollapsedState() {
  const saved = localStorage.getItem("sidebarCollapsed");
  if (saved === "true" || saved === "false") return saved === "true";
  return window.matchMedia("(max-width: 1023px)").matches;
}

export function Shell({
  activePage,
  activeDrawCycleId,
  isAdmin,
  isResident = false,
  residentName,
  adminEmail,
  onNavigate,
  onLogout,
  children
}: ShellProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsedState);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem("sidebarCollapsed", String(next));
      return next;
    });
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-ivory">
      <div className="fixed inset-y-0 left-0 z-40 hidden md:block">
        <Sidebar
          activeDrawCycleId={activeDrawCycleId}
          activePage={activePage}
          collapsed={collapsed}
          isAdmin={isAdmin}
          isResident={isResident}
          onNavigate={onNavigate}
        />
      </div>

      <div className={`min-w-0 transition-[margin] duration-200 ease-out ${
        collapsed ? "md:ml-[76px]" : "md:ml-[252px]"
      }`}>
        <header className="page-band sticky top-0 z-30">
          <div className="flex min-h-20 flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <button
                aria-controls="mobile-navigation"
                aria-expanded={mobileOpen}
                aria-label="Open navigation menu"
                className="focus-ring rounded-lg border border-slate-200 bg-white p-2 text-navy hover:bg-slate-50 md:hidden"
                onClick={() => setMobileOpen(true)}
                type="button"
              >
                <Menu aria-hidden="true" className="h-5 w-5" />
              </button>
              <button
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                className="focus-ring hidden rounded-lg border border-slate-200 bg-white p-2 text-navy hover:bg-slate-50 md:inline-flex"
                onClick={toggleSidebar}
                type="button"
              >
                {collapsed ? (
                  <PanelLeftOpen aria-hidden="true" className="h-5 w-5" />
                ) : (
                  <PanelLeftClose aria-hidden="true" className="h-5 w-5" />
                )}
              </button>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide text-fairness">FairRoom</p>
                <h1 className="truncate text-lg font-extrabold text-navy sm:text-xl">{pageTitles[activePage]}</h1>
              </div>
            </div>

            {!isResident ? <div className="order-3 w-full xl:order-none xl:w-auto">
              <BuildingControls isAdmin={isAdmin} />
            </div> : null}

            <div className="flex min-w-0 items-center gap-2">
              {isAdmin || isResident ? (
                <>
                  <div className="min-w-0 text-right">
                    <p className="hidden text-xs font-semibold text-fairness lg:block">{isAdmin ? "Admin session active" : "Resident session active"}</p>
                    <p className="max-w-44 truncate text-sm font-semibold text-navy">{isAdmin ? adminEmail ?? "Admin" : residentName ?? "Resident"}</p>
                  </div>
                  <button
                    aria-label="Logout"
                    className="focus-ring inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={onLogout}
                    type="button"
                  >
                    <LogOut aria-hidden="true" className="h-4 w-4" />
                    <span className="hidden sm:inline">Logout</span>
                  </button>
                </>
              ) : (
                <button
                className="focus-ring inline-flex items-center gap-2 rounded-lg bg-earth px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-forest"
                  onClick={() => onNavigate("admin")}
                  type="button"
                >
                  <LockKeyhole aria-hidden="true" className="h-4 w-4" />
                  <span className="hidden sm:inline">Admin Login</span>
                  <span className="sm:hidden">Login</span>
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto min-w-0 max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" id="mobile-navigation">
          <button
            aria-label="Close navigation menu"
            className="absolute inset-0 h-full w-full cursor-default bg-slate-950/60"
            onClick={() => setMobileOpen(false)}
            type="button"
          />
          <div className="absolute inset-y-0 left-0">
            <Sidebar
              activeDrawCycleId={activeDrawCycleId}
              activePage={activePage}
              collapsed={false}
              isAdmin={isAdmin}
              isResident={isResident}
              mobile
              onClose={() => setMobileOpen(false)}
              onNavigate={onNavigate}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
