import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  detail: string;
  tone: "blue" | "green" | "orange" | "purple";
  icon: LucideIcon;
}

const toneClasses = {
  blue: "bg-blue-50 text-blue-700 border-blue-100",
  green: "bg-green-50 text-green-700 border-green-100",
  orange: "bg-orange-50 text-orange-700 border-orange-100",
  purple: "bg-purple-50 text-purple-700 border-purple-100"
};

const accentClasses = {
  blue: "from-blue-500 to-blue-700",
  green: "from-green-500 to-green-700",
  orange: "from-orange-500 to-orange-700",
  purple: "from-purple-500 to-purple-700"
};

export function StatCard({ title, value, detail, tone, icon: Icon }: StatCardProps) {
  const numeric = typeof value === "number"
    ? { target: value, suffix: "" }
    : /^(\d+)(%)$/.test(value)
      ? { target: Number(value.slice(0, -1)), suffix: "%" }
      : null;
  const [displayValue, setDisplayValue] = useState<string | number>(numeric ? 0 : value);

  useEffect(() => {
    if (!numeric || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplayValue(value);
      return;
    }
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min((now - started) / 450, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(`${Math.round(numeric.target * eased)}${numeric.suffix}`);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <section className="dashboard-reveal group overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className={`h-1.5 bg-gradient-to-r ${accentClasses[tone]}`} />
      <div className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-bold text-navy">{displayValue}</p>
        </div>
        <div className={`rounded-lg border p-3 ${toneClasses[tone]}`}>
          <Icon aria-hidden="true" className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-4 text-sm text-slate-600">{detail}</p>
      </div>
    </section>
  );
}
