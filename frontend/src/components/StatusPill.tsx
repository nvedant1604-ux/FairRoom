interface StatusPillProps {
  label: string | number;
  tone?: "green" | "orange" | "blue" | "purple" | "red" | "slate";
}

const tones = {
  green: "bg-green-50 text-green-700 ring-green-200",
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  purple: "bg-purple-50 text-purple-700 ring-purple-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  slate: "bg-slate-50 text-slate-700 ring-slate-200"
};

export function StatusPill({ label, tone = "slate" }: StatusPillProps) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tones[tone]}`}>
      {label}
    </span>
  );
}
