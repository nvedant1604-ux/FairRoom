import { useEffect, useState, type FormEvent } from "react";
import { LockKeyhole, Home, Sparkles } from "lucide-react";

import AdminApp from "./AdminApp";
import { ResidentPortal } from "./ResidentPortal";
import { apiRequest, clearAdminToken, clearResidentToken, getAdminToken, getResidentToken, setResidentToken } from "./lib/api";

type Role = "admin" | "resident" | null;

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [role, setRole] = useState<Role | "checking">("checking");
  const [residentName, setResidentName] = useState("");
  const [residentId, setResidentId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function navigate(to: string, replace = false) {
    window.history[replace ? "replaceState" : "pushState"]({}, "", to);
    setPath(to);
  }

  useEffect(() => {
    let live = true;
    if (getAdminToken()) {
      apiRequest<{ role: string }>("/admin/session")
        .then(data => { if (live) setRole(data.role === "admin" ? "admin" : null); })
        .catch(() => { if (live) setRole(null); });
    } else if (getResidentToken()) {
      apiRequest<{ role: string; full_name: string }>("/resident/session")
        .then(data => { if (live) { setRole(data.role === "resident" ? "resident" : null); setResidentName(data.full_name); } })
        .catch(() => { if (live) setRole(null); });
    } else setRole(null);
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    const adminLogin = () => { setRole("admin"); setPath(window.location.pathname); };
    const adminLogout = () => { setRole(null); setPath(window.location.pathname); };
    const adminExpired = () => {
      window.sessionStorage.setItem("fairroom_admin_session_notice", "Your admin session has expired. Please log in again.");
      setRole(null); setPath(window.location.pathname);
    };
    const residentExpired = () => { setRole(null); navigate("/resident/login", true); };
    window.addEventListener("popstate", onPop);
    window.addEventListener("fairroom-admin-login", adminLogin);
    window.addEventListener("fairroom-admin-logout", adminLogout);
    window.addEventListener("admin-session-expired", adminExpired);
    window.addEventListener("resident-session-expired", residentExpired);
    return () => {
      window.removeEventListener("popstate", onPop); window.removeEventListener("fairroom-admin-login", adminLogin);
      window.removeEventListener("fairroom-admin-logout", adminLogout); window.removeEventListener("admin-session-expired", adminExpired);
      window.removeEventListener("resident-session-expired", residentExpired);
    };
  }, []);

  useEffect(() => {
    if (role === "checking") return;
    if (role === "resident" && !path.startsWith("/resident/")) navigate("/resident/dashboard", true);
    if (role === "admin" && path.startsWith("/resident/")) navigate("/admin/dashboard", true);
    if (!role && path.startsWith("/resident/") && path !== "/resident/login") navigate("/resident/login", true);
    if (!role && path.startsWith("/admin/") && path !== "/admin/login") navigate("/admin-login", true);
  }, [role, path]);

  async function residentLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(null);
    try {
      const data = await apiRequest<{ token: string; role: string; full_name: string }>("/resident/login", {
        method: "POST", body: JSON.stringify({ resident_id: Number(residentId), password })
      });
      if (data.role !== "resident") throw new Error("Resident access could not be verified.");
      clearAdminToken(); setResidentToken(data.token); setResidentName(data.full_name);
      setPassword(""); setRole("resident"); navigate("/resident/dashboard", true);
    } catch (err) { setError(err instanceof Error ? err.message : "Resident login failed."); }
    finally { setLoading(false); }
  }

  async function residentLogout() {
    const request = apiRequest("/resident/logout", { method: "POST" });
    clearResidentToken(); setRole(null); setResidentName(""); navigate("/login", true);
    try { await request; } catch { /* local session is cleared even when backend is unavailable */ }
  }

  if (role === "checking") return <div className="flex min-h-screen items-center justify-center bg-ivory text-sm font-semibold text-forest">Checking your session…</div>;
  if (role === "resident") return <ResidentPortal residentName={residentName} onLogout={() => void residentLogout()} />;
  if (role === "admin") return <AdminApp />;
  if (path === "/admin-login" || path === "/admin/login" || ["/residents", "/rooms", "/lottery", "/results", "/audit", "/report", "/resident-search", "/resident-history", "/draw-history", "/draw-cycle-setup", "/eligibility"].includes(path)) return <AdminApp />;

  return <main className="flex min-h-screen items-center justify-center bg-ivory px-4 py-8">
    <div className="w-full max-w-xl rounded-2xl border border-sage bg-white p-6 shadow-soft sm:p-8">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-earth text-white"><Sparkles className="h-6 w-6" aria-hidden="true" /></div>
      <p className="mt-5 text-sm font-bold uppercase tracking-[0.16em] text-earth">FairRoom</p>
      <h1 className="mt-2 text-3xl font-extrabold text-navy">Intelligent Housing Allocation System</h1>
      {path === "/resident/login" ? <>
        <p className="mt-3 text-sm text-slate-600">Sign in with the resident ID and password provided by your building administrator.</p>
        <form className="mt-6 space-y-4" onSubmit={event => void residentLogin(event)}>
          <div><label className="text-sm font-semibold text-navy" htmlFor="resident_id">Resident ID</label>
            <input className="focus-ring mt-1 w-full rounded-lg border px-3 py-2" id="resident_id" inputMode="numeric" min="1" type="number"
              value={residentId} onChange={event => setResidentId(event.target.value)} required /></div>
          <div><label className="text-sm font-semibold text-navy" htmlFor="resident_password">Password</label>
            <input className="focus-ring mt-1 w-full rounded-lg border px-3 py-2" id="resident_password" type="password" autoComplete="current-password"
              value={password} onChange={event => setPassword(event.target.value)} required /></div>
          {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
          <button className="focus-ring w-full rounded-lg bg-earth px-4 py-3 font-bold text-white hover:bg-forest disabled:opacity-50" disabled={loading} type="submit">
            {loading ? "Signing in…" : "Login as Resident"}</button>
        </form>
        <button className="focus-ring mt-4 text-sm font-semibold text-earth hover:text-forest" onClick={() => navigate("/login")} type="button">Back to role selection</button>
      </> : <>
        <p className="mt-3 text-sm text-slate-600">Choose how you want to continue.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button className="focus-ring flex items-center gap-3 rounded-xl border border-sage bg-sage-light/40 p-4 text-left font-bold text-forest hover:bg-sage-light"
            onClick={() => navigate("/admin-login")} type="button"><LockKeyhole className="h-5 w-5" aria-hidden="true"/>Admin Login</button>
          <button className="focus-ring flex items-center gap-3 rounded-xl border border-sage bg-sage-light/40 p-4 text-left font-bold text-forest hover:bg-sage-light"
            onClick={() => navigate("/resident/login")} type="button"><Home className="h-5 w-5" aria-hidden="true"/>Resident Login</button>
        </div>
      </>}
    </div>
  </main>;
}
