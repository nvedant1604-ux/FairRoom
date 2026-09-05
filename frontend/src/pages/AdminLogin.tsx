import { useState, type FormEvent } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";

import { StatusPill } from "../components/StatusPill";
import { apiRequest, clearAdminToken, setAdminEmail, setAdminToken } from "../lib/api";

interface AdminLoginProps {
  isAdmin: boolean;
  onLogin: (token: string) => void;
  onLogout: () => void;
  notice?: string | null;
}

export function AdminLogin({ isAdmin, onLogin, onLogout, notice }: AdminLoginProps) {
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const response = await apiRequest<{ token: string; admin_name: string; email: string }>("/admin/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      setAdminToken(response.token);
      setAdminEmail(response.email);
      onLogin(response.token);
      setMessage(`Welcome, ${response.admin_name}. Admin actions are enabled.`);
    } catch (err) {
      clearAdminToken();
      setError(err instanceof Error ? err.message : "Admin login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Authentication status: Admin access required</p>
            <h2 className="mt-2 text-2xl font-bold text-navy">Admin Login Required</h2>
          </div>
          <LockKeyhole aria-hidden="true" className="h-8 w-8 text-blue-700" />
        </div>
        <form className="mt-5 space-y-4" onSubmit={login}>
          <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            Resident registration, room management, lottery draw and audit records are available only to authenticated administrators.
          </p>
          {notice ? <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm font-semibold text-orange-800">{notice}</div> : null}
          <div>
            <label className="text-sm font-semibold text-slate-700" htmlFor="admin_email">
              Admin Email
            </label>
            <input
              className="focus-ring mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              id="admin_email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700" htmlFor="admin_password">
              Password
            </label>
            <input
              className="focus-ring mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              id="admin_password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          ) : null}
          {message ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-700">
              {message}
            </div>
          ) : null}
          <button
            className="focus-ring w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:bg-slate-400"
            disabled={loading}
            type="submit"
          >
            {loading ? "Logging in..." : "Login as Admin"}
          </button>
          {isAdmin ? (
            <button
              className="focus-ring w-full rounded-lg border border-slate-300 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50"
              onClick={onLogout}
              type="button"
            >
              Logout Admin
            </button>
          ) : null}
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-bold text-navy">Admin Capabilities</h2>
          <StatusPill label={isAdmin ? "Admin session active" : "Admin access required"} tone={isAdmin ? "green" : "orange"} />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {[
            "Add society/project sample data",
            "Add and verify residents",
            "Add available rooms",
            "Start locked lottery",
            "View audit logs",
            "Download reports"
          ].map((item) => (
            <div key={item} className="flex gap-3 rounded-lg border border-slate-200 p-3">
              <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 text-green-700" />
              <p className="text-sm font-semibold text-slate-700">{item}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
          Demo credentials are prefilled for local MVP testing. In production, connect this to a verified identity provider and role-based permissions.
        </div>
      </section>
    </div>
  );
}
