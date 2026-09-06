interface StatusPillProps {
  label: string | number;
  tone?: "green" | "orange" | "blue" | "purple" | "red" | "slate";
}

const tones = {
  green: "bg-sage-light text-forest ring-sage",
  orange: "bg-mustard/35 text-orange-800 ring-mustard",
  blue: "bg-info/10 text-info ring-info/25",
  purple: "bg-sand text-terracotta-dark ring-clay/40",
  red: "bg-red-50 text-red-700 ring-red-200",
  slate: "bg-cream text-slate-700 ring-slate-200"
};

export function StatusPill({ label, tone = "slate" }: StatusPillProps) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tones[tone]}`}>
      {label}
    </span>
  );
}
