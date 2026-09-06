interface EmptyStateProps {
  title: string;
  detail: string;
}

export function EmptyState({ title, detail }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-sage bg-cream p-8 text-center">
      <h3 className="text-lg font-semibold text-navy">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{detail}</p>
    </div>
  );
}
