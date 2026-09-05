import type { ReactNode } from "react";

interface ProtectedRouteProps {
  sessionStatus: "checking" | "authenticated" | "anonymous";
  children: ReactNode;
}

export function ProtectedRoute({ sessionStatus, children }: ProtectedRouteProps) {
  if (sessionStatus === "checking") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm font-semibold text-slate-600">
        Checking admin session…
      </div>
    );
  }

  return sessionStatus === "authenticated" ? <>{children}</> : null;
}
