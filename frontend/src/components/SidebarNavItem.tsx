import { LockKeyhole, type LucideIcon } from "lucide-react";

import type { PageKey } from "../pages/pageTypes";

interface SidebarNavItemProps {
  page: PageKey;
  label: string;
  icon: LucideIcon;
  active: boolean;
  collapsed: boolean;
  locked: boolean;
  onSelect: (page: PageKey) => void;
}

export function SidebarNavItem({
  page,
  label,
  icon: Icon,
  active,
  collapsed,
  locked,
  onSelect
}: SidebarNavItemProps) {
  return (
    <button
      aria-current={active ? "page" : undefined}
      aria-label={locked ? `${label}, admin access required` : label}
      className={`focus-ring relative flex min-h-11 w-full items-center rounded-lg text-left text-sm font-semibold transition ${
        collapsed ? "justify-center px-2" : "gap-3 px-3"
      } ${
        active
          ? "bg-blue-700 text-white shadow-sm"
          : "bg-transparent text-navy hover:bg-blue-50 hover:text-blue-800"
      }`}
      onClick={() => onSelect(page)}
      title={collapsed ? label : undefined}
      type="button"
    >
      <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
      {!collapsed ? <span className="min-w-0 flex-1 whitespace-normal leading-5">{label}</span> : null}
      {locked ? (
        <span
          aria-hidden="true"
          className={
            collapsed
              ? `absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${
                  active ? "bg-white text-blue-700" : "bg-slate-200 text-slate-600"
                }`
              : `shrink-0 text-xs ${active ? "text-white" : "text-slate-400"}`
          }
        >
          <LockKeyhole aria-hidden="true" className={collapsed ? "h-2.5 w-2.5" : "h-3.5 w-3.5"} />
        </span>
      ) : null}
    </button>
  );
}
