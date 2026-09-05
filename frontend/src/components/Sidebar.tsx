import {
  BarChart3,
  ClipboardCheck,
  History,
  Home,
  ListChecks,
  ScrollText,
  Search,
  Settings2,
  Sparkles,
  Users,
  X,
  type LucideIcon
} from "lucide-react";

import type { PageKey } from "../pages/pageTypes";
import { SidebarNavItem } from "./SidebarNavItem";

interface SidebarProps {
  activePage: PageKey;
  activeDrawCycleId: number | null;
  collapsed: boolean;
  isAdmin: boolean;
  mobile?: boolean;
  onClose?: () => void;
  onNavigate: (page: PageKey) => void;
}

interface NavigationItem {
  key: PageKey;
  label: string;
  icon: LucideIcon;
  protected?: boolean;
  activeCycleOnly?: boolean;
}

const navigationGroups: Array<{ label: string; items: NavigationItem[] }> = [
  { label: "Overview", items: [{ key: "dashboard", label: "Home Dashboard", icon: Home }] },
  {
    label: "Management",
    items: [
      { key: "residents", label: "Resident Registration", icon: Users, protected: true },
      { key: "rooms", label: "Room Management", icon: BarChart3, protected: true }
    ]
  },
  {
    label: "Lottery Process",
    items: [
      { key: "drawCycleSetup", label: "Draw Cycle Setup", icon: Settings2, protected: true, activeCycleOnly: true },
      { key: "lottery", label: "Lottery Draw", icon: Sparkles, protected: true },
      { key: "results", label: "Allocation Results", icon: ClipboardCheck, protected: true }
    ]
  },
  {
    label: "History",
    items: [
      { key: "residentHistory", label: "Resident History", icon: History, protected: true },
      { key: "drawHistory", label: "Draw History", icon: History, protected: true },
      { key: "audit", label: "Audit Logs", icon: ListChecks, protected: true }
    ]
  },
  {
    label: "Reports",
    items: [
      { key: "report", label: "Transparency Report", icon: ScrollText, protected: true },
      { key: "residentSearch", label: "Resident Search", icon: Search }
    ]
  }
];

export function Sidebar({
  activePage,
  activeDrawCycleId,
  collapsed,
  isAdmin,
  mobile = false,
  onClose,
  onNavigate
}: SidebarProps) {
  const visuallyCollapsed = mobile ? false : collapsed;

  function selectPage(page: PageKey) {
    if (page === "drawCycleSetup" && activeDrawCycleId) {
      localStorage.setItem("ai_lottery_active_draw_cycle", String(activeDrawCycleId));
    }
    onNavigate(page);
    onClose?.();
  }

  return (
    <aside
      aria-label={mobile ? "Mobile navigation drawer" : "Application sidebar"}
      className={`flex h-full flex-col border-r border-slate-200 bg-white shadow-soft ${
        mobile ? "w-[280px]" : collapsed ? "w-[76px]" : "w-[252px]"
      }`}
      data-collapsed={visuallyCollapsed ? "true" : "false"}
      data-testid={mobile ? "mobile-sidebar" : "desktop-sidebar"}
    >
      <div className={`flex min-h-20 items-center border-b border-slate-200 ${
        visuallyCollapsed ? "justify-center px-2" : "justify-between gap-3 px-4"
      }`}>
        <div className={`flex min-w-0 items-center ${visuallyCollapsed ? "justify-center" : "gap-3"}`}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white">
            <Sparkles aria-hidden="true" className="h-5 w-5" />
          </span>
          {!visuallyCollapsed ? (
            <div className="min-w-0">
              <p className="text-sm font-extrabold leading-tight text-navy">FairRoom</p>
              <p className="mt-0.5 text-xs font-semibold text-fairness">Fair &amp; Transparent</p>
            </div>
          ) : null}
        </div>
        {mobile ? (
          <button
            aria-label="Close navigation menu"
            className="focus-ring rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-3 py-4">
        {navigationGroups.map((group, groupIndex) => {
          const visibleItems = group.items.filter(
            (item) => !item.activeCycleOnly || Boolean(activeDrawCycleId) || activePage === item.key
          );
          if (visibleItems.length === 0) return null;
          return (
            <section className={groupIndex === 0 ? "" : "mt-5"} key={group.label}>
              {!visuallyCollapsed ? (
                <h2 className="mb-2 px-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
                  {group.label}
                </h2>
              ) : null}
              <div className="space-y-1">
                {visibleItems.map((item) => (
                  <SidebarNavItem
                    active={activePage === item.key}
                    collapsed={visuallyCollapsed}
                    icon={item.icon}
                    key={item.key}
                    label={item.label}
                    locked={Boolean(item.protected && !isAdmin)}
                    onSelect={selectPage}
                    page={item.key}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </nav>

      {!visuallyCollapsed ? (
        <div className="border-t border-slate-200 px-4 py-3 text-xs leading-5 text-slate-500">
          Transparent room allocation with a complete audit trail.
        </div>
      ) : null}
    </aside>
  );
}
