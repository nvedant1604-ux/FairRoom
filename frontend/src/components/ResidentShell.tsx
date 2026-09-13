import {
  BadgeCheck, ClipboardCheck, History, Home, LogOut, Menu,
  PanelLeftClose, PanelLeftOpen, Sparkles, UserRound, X,
  type LucideIcon
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

export type ResidentPageKey =
  | "residentDashboard"
  | "residentProfile"
  | "residentEligibility"
  | "residentLottery"
  | "residentAllocation"
  | "residentHistorySelf";

type NavigationItem = { page: ResidentPageKey; label: string; icon: LucideIcon };

const navigation: NavigationItem[] = [
  { page: "residentDashboard", label: "Dashboard", icon: Home },
  { page: "residentProfile", label: "My Profile", icon: UserRound },
  { page: "residentEligibility", label: "My Eligibility", icon: BadgeCheck },
  { page: "residentLottery", label: "My Lottery", icon: Sparkles },
  { page: "residentAllocation", label: "My Allocation", icon: ClipboardCheck },
  { page: "residentHistorySelf", label: "My History", icon: History }
];

const titles: Record<ResidentPageKey, string> = {
  residentDashboard: "Dashboard",
  residentProfile: "My Profile",
  residentEligibility: "My Eligibility",
  residentLottery: "My Lottery",
  residentAllocation: "My Allocation",
  residentHistorySelf: "My History"
};

function ResidentNavigation({
  activePage, collapsed, mobile, onNavigate, onLogout, onClose
}: {
  activePage: ResidentPageKey;
  collapsed: boolean;
  mobile?: boolean;
  onNavigate: (page: ResidentPageKey) => void;
  onLogout: () => void;
  onClose?: () => void;
}) {
  const compact = collapsed && !mobile;
  return <aside
    aria-label={mobile ? "Mobile resident navigation" : "Resident navigation"}
    className={`flex h-full flex-col border-r border-sage bg-cream shadow-soft ${mobile ? "w-[280px]" : collapsed ? "w-[76px]" : "w-[252px]"}`}
    data-collapsed={compact ? "true" : "false"}
    data-testid={mobile ? "mobile-sidebar" : "desktop-sidebar"}
  >
    <div className={`flex min-h-20 items-center border-b border-sage/60 ${compact ? "justify-center px-2" : "justify-between gap-3 px-4"}`}>
      <div className={`flex min-w-0 items-center ${compact ? "justify-center" : "gap-3"}`}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-earth text-white shadow-sm">
          <Home aria-hidden="true" className="h-5 w-5" />
        </span>
        {!compact ? <div className="min-w-0">
          <p className="text-sm font-extrabold leading-tight text-navy">FairRoom</p>
          <p className="mt-0.5 text-xs font-semibold text-fairness">Resident Portal</p>
        </div> : null}
      </div>
      {mobile ? <button aria-label="Close navigation menu" className="focus-ring rounded-lg p-2 text-navy hover:bg-sage-light"
        onClick={onClose} type="button"><X aria-hidden="true" className="h-5 w-5" /></button> : null}
    </div>

    <nav aria-label="Resident pages" className="flex-1 overflow-y-auto px-3 py-4">
      {!compact ? <p className="mb-2 px-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-earth/70">My Housing</p> : null}
      <div className="space-y-1">{navigation.map(({ page, label, icon: Icon }) => {
        const active = activePage === page;
        return <button key={page} type="button" aria-label={label} aria-current={active ? "page" : undefined}
          className={`focus-ring flex min-h-11 w-full items-center rounded-lg border-l-4 text-left text-sm font-semibold transition ${compact ? "justify-center px-2" : "gap-3 px-3"} ${active ? "border-earth bg-sage-light text-forest" : "border-transparent text-navy hover:bg-sage-light hover:text-forest"}`}
          onClick={() => { onNavigate(page); onClose?.(); }} title={compact ? label : undefined}>
          <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
          {!compact ? <span className="min-w-0 flex-1">{label}</span> : null}
        </button>;
      })}</div>
    </nav>

    <div className="border-t border-sage/60 p-3">
      <button type="button" aria-label="Logout" onClick={onLogout}
        className={`focus-ring flex min-h-11 w-full items-center rounded-lg text-sm font-semibold text-navy hover:bg-sage-light hover:text-forest ${compact ? "justify-center px-2" : "gap-3 px-3"}`}
        title={compact ? "Logout" : undefined}>
        <LogOut aria-hidden="true" className="h-5 w-5 shrink-0" />
        {!compact ? <span>Logout</span> : null}
      </button>
    </div>
  </aside>;
}

function initialCollapsedState() {
  const saved = localStorage.getItem("residentSidebarCollapsed");
  if (saved === "true" || saved === "false") return saved === "true";
  return window.matchMedia("(max-width: 1023px)").matches;
}

export function ResidentShell({ activePage, residentName, onNavigate, onLogout, children }: {
  activePage: ResidentPageKey;
  residentName: string;
  onNavigate: (page: ResidentPageKey) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
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
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  function toggleSidebar() {
    setCollapsed(current => {
      const next = !current;
      localStorage.setItem("residentSidebarCollapsed", String(next));
      return next;
    });
  }

  return <div className="min-h-screen overflow-x-hidden bg-ivory">
    <div className="fixed inset-y-0 left-0 z-40 hidden md:block">
      <ResidentNavigation activePage={activePage} collapsed={collapsed} onNavigate={onNavigate} onLogout={onLogout} />
    </div>
    <div className={`min-w-0 transition-[margin] duration-200 ease-out ${collapsed ? "md:ml-[76px]" : "md:ml-[252px]"}`}>
      <header className="page-band sticky top-0 z-30">
        <div className="flex min-h-20 items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <button type="button" aria-controls="mobile-resident-navigation" aria-expanded={mobileOpen}
            aria-label="Open navigation menu" onClick={() => setMobileOpen(true)}
            className="focus-ring rounded-lg border border-sage bg-white p-2 text-navy hover:bg-sage-light md:hidden">
            <Menu aria-hidden="true" className="h-5 w-5" />
          </button>
          <button type="button" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={toggleSidebar}
            className="focus-ring hidden rounded-lg border border-sage bg-white p-2 text-navy hover:bg-sage-light md:inline-flex">
            {collapsed ? <PanelLeftOpen aria-hidden="true" className="h-5 w-5" /> : <PanelLeftClose aria-hidden="true" className="h-5 w-5" />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-fairness">FairRoom · Resident Portal</p>
            <h1 className="truncate text-lg font-extrabold text-navy sm:text-xl">{titles[activePage]}</h1>
          </div>
          <p className="max-w-40 truncate text-right text-sm font-semibold text-forest sm:max-w-56" title={residentName}>{residentName || "Resident"}</p>
        </div>
      </header>
      <main className="mx-auto min-w-0 max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>

    {mobileOpen ? <div className="fixed inset-0 z-50 md:hidden" id="mobile-resident-navigation">
      <button type="button" aria-label="Close navigation menu" onClick={() => setMobileOpen(false)}
        className="absolute inset-0 h-full w-full cursor-default bg-slate-950/60" />
      <div className="absolute inset-y-0 left-0">
        <ResidentNavigation activePage={activePage} collapsed={false} mobile onNavigate={onNavigate}
          onLogout={onLogout} onClose={() => setMobileOpen(false)} />
      </div>
    </div> : null}
  </div>;
}
