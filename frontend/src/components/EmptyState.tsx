interface EmptyStateProps {
  title: string;
  detail: string;
}

export function EmptyState({ title, detail }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
      <h3 className="text-lg font-semibold text-navy">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{detail}</p>
    </div>
  );
}

