import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { ProtectedRoute } from "./components/ProtectedRoute";
import { Shell } from "./components/Shell";
import { apiRequest, clearAdminToken, getAdminEmail, getAdminToken, setAdminToken as storeAdminToken } from "./lib/api";
import { AdminLogin } from "./pages/AdminLogin";
import { AllocationResults } from "./pages/AllocationResults";
import { AuditLogs } from "./pages/AuditLogs";
import { Dashboard } from "./pages/Dashboard";
import { LotteryDraw } from "./pages/LotteryDraw";
import type { PageKey } from "./pages/pageTypes";
import { ResidentRegistration } from "./pages/ResidentRegistration";
import { ResidentSearch } from "./pages/ResidentSearch";
import { RoomManagement } from "./pages/RoomManagement";
import { TransparencyReport } from "./pages/TransparencyReport";
import { ResidentHistory } from "./pages/ResidentHistory";
import { DrawHistory } from "./pages/DrawHistory";
import { DrawCycleSetup } from "./pages/DrawCycleSetup";
import { EligibilityCriteria } from "./pages/EligibilityCriteria";
import type { Allocation, AuditLog, DashboardStats, DemoResetResponse, LotteryDraw as LotteryDrawRecord, Resident, Room, TransparencyReport as Report } from "./types";
import { useBuilding } from "./context/BuildingContext";

type SessionStatus = "checking" | "authenticated" | "anonymous";

const pagePaths: Record<PageKey, string> = {
  dashboard: "/", residents: "/residents", rooms: "/rooms", lottery: "/lottery",
  results: "/results", audit: "/audit", report: "/report", residentSearch: "/resident-search", residentHistory: "/resident-history", drawHistory: "/draw-history", drawCycleSetup: "/draw-cycle-setup", eligibility: "/eligibility", admin: "/admin-login"
};
const pathPages = Object.fromEntries(Object.entries(pagePaths).map(([key, path]) => [path, key])) as Record<string, PageKey>;
const protectedPages = new Set<PageKey>(["residents", "rooms", "lottery", "results", "audit", "report", "residentHistory", "drawHistory", "drawCycleSetup", "eligibility"]);

function pageFromLocation(): PageKey {
  return pathPages[window.location.pathname.replace(/\/$/, "") || "/"] ?? "dashboard";
}

function safeReturnPage(value: unknown): PageKey {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? pathPages[value] ?? "dashboard"
    : "dashboard";
}

export default function App() {
  const { selectedBuilding, selectedBuildingId, refreshBuildings, loading: buildingsLoading } = useBuilding();
  const [activePage, setActivePage] = useState<PageKey>(pageFromLocation);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>(() => getAdminToken() ? "checking" : "anonymous");
  const [adminEmail, setAdminEmailState] = useState<string | null>(() => getAdminEmail());
  const [loginNotice, setLoginNotice] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardStats | null>(null);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [activeDrawCycleId, setActiveDrawCycleId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const refreshSequence = useRef(0);

  const refreshAll = useCallback(async () => {
    const requestSequence = ++refreshSequence.current;
    if (!selectedBuildingId) {
      if (requestSequence === refreshSequence.current) {
        setDashboard(null); setResidents([]); setRooms([]); setAllocations([]); setAudits([]); setReport(null); setActiveDrawCycleId(null); setLoading(false);
      }
      return;
    }
    setLoading(true); setGlobalError(null);
    setDashboard(null); setResidents([]); setRooms([]); setAllocations([]); setAudits([]); setReport(null); setActiveDrawCycleId(null);
    try {
      const base = `/buildings/${selectedBuildingId}`;
      const [dashboardData, residentData, roomData, allocationData, auditData, reportData, drawData] = await Promise.all([
        apiRequest<DashboardStats>(`${base}/dashboard`), apiRequest<Resident[]>(`${base}/residents`), apiRequest<Room[]>(`${base}/rooms`),
        apiRequest<Allocation[]>(`${base}/allocations`), getAdminToken() ? apiRequest<AuditLog[]>(`${base}/audit`) : Promise.resolve([]), apiRequest<Report>(`${base}/report`),
        getAdminToken() ? apiRequest<LotteryDrawRecord[]>(`${base}/draws`) : Promise.resolve([])
      ]);
      if (requestSequence !== refreshSequence.current) return;
      setDashboard(dashboardData); setResidents(residentData); setRooms(roomData); setAllocations(allocationData); setAudits(auditData); setReport(reportData);
      setActiveDrawCycleId(drawData.find((draw) => ["Preparing", "Ready", "In Progress"].includes(draw.status))?.id ?? null);
    } catch (err) {
      if (requestSequence === refreshSequence.current) {
        setGlobalError(err instanceof Error ? err.message : "The dashboard could not connect to the backend API.");
      }
    } finally {
      if (requestSequence === refreshSequence.current) setLoading(false);
    }
  }, [selectedBuildingId]);

  const navigate = useCallback((page: PageKey, replace = false, state?: Record<string, unknown>) => {
    const method = replace ? "replaceState" : "pushState";
    window.history[method](state ?? {}, "", pagePaths[page]);
    setActivePage(page);
  }, []);

  useEffect(() => { void refreshAll(); }, [refreshAll, sessionStatus]);

  useEffect(() => {
    const refreshCycleState = () => { void refreshAll(); };
    window.addEventListener("draw-cycle-changed", refreshCycleState);
    window.addEventListener("building-updated", refreshCycleState);
    return () => {
      window.removeEventListener("draw-cycle-changed", refreshCycleState);
      window.removeEventListener("building-updated", refreshCycleState);
    };
  }, [refreshAll]);

  useEffect(() => {
    const onPopState = () => setActivePage(pageFromLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!getAdminToken()) { setSessionStatus("anonymous"); return; }
    setSessionStatus("checking");
    const requestedPage = pageFromLocation();
    apiRequest<{ email: string }>("/admin/session")
      .then((data) => { if (!cancelled) { setAdminEmailState(data.email); setSessionStatus("authenticated"); } })
      .catch(() => {
        if (!cancelled) {
          if (protectedPages.has(requestedPage)) {
            setLoginNotice("Your admin session has expired. Please log in again.");
            navigate("admin", true, { returnTo: pagePaths[requestedPage] });
          }
          setSessionStatus("anonymous");
        }
      });
    return () => { cancelled = true; };
  }, [navigate]);

  useEffect(() => {
    const expired = () => {
      const currentPage = pageFromLocation();
      const returnTo = protectedPages.has(currentPage) ? pagePaths[currentPage] : undefined;
      setSessionStatus("anonymous"); setAdminEmailState(null);
      if (returnTo) {
        setLoginNotice("Your admin session has expired. Please log in again.");
        navigate("admin", true, { returnTo });
      }
    };
    window.addEventListener("admin-session-expired", expired);
    return () => window.removeEventListener("admin-session-expired", expired);
  }, [navigate]);

  useEffect(() => {
    if (pageFromLocation() !== activePage) return;
    if (!protectedPages.has(activePage) || sessionStatus === "checking" || sessionStatus === "authenticated") return;
    setLoginNotice(current => current ?? "Admin login is required to access this page.");
    navigate("admin", true, { returnTo: pagePaths[activePage] });
  }, [activePage, navigate, sessionStatus]);

  function login(token: string) {
    storeAdminToken(token); setSessionStatus("authenticated"); setAdminEmailState(getAdminEmail()); setLoginNotice(null);
    const returnPage = safeReturnPage(window.history.state?.returnTo);
    navigate(returnPage, true); void refreshBuildings();
  }

  async function logout() {
    const logoutRequest = apiRequest<void>("/admin/logout", { method: "POST" });
    clearAdminToken(); setSessionStatus("anonymous"); setAdminEmailState(null); setLoginNotice(null); navigate("admin");
    try { await logoutRequest; } catch { /* local logout always succeeds */ }
  }

  async function resetDemoData() {
    if (!selectedBuildingId) throw new Error("Select or add a building to continue.");
    const result = await apiRequest<DemoResetResponse>(`/buildings/${selectedBuildingId}/demo/reset`, { method: "POST" }); await refreshAll(); return result;
  }

  const isAdmin = sessionStatus === "authenticated";
  const protectedContent = (content: ReactNode) => <ProtectedRoute sessionStatus={sessionStatus}>{content}</ProtectedRoute>;
  const page = (() => {
    switch (activePage) {
      case "dashboard": return !selectedBuilding&&!buildingsLoading?<div className="rounded-xl border border-sage bg-white p-8 text-center shadow-soft"><h2 className="text-2xl font-bold text-navy">No buildings have been added yet.</h2>{isAdmin?<button className="mt-4 rounded-lg bg-earth px-4 py-2 font-bold text-white hover:bg-forest" onClick={()=>window.dispatchEvent(new Event("add-building"))}>Add Your First Building</button>:null}</div>:<Dashboard stats={dashboard} allocations={allocations} loading={loading||buildingsLoading} isAdmin={isAdmin} onDemoReset={resetDemoData} onAdminLogin={() => navigate("admin")} />;
      case "residents": return protectedContent(<ResidentRegistration buildingId={selectedBuildingId!} buildingName={selectedBuilding?.building_name??""} residents={residents} isAdmin={isAdmin} onRefresh={refreshAll} />);
      case "rooms": return protectedContent(<RoomManagement buildingId={selectedBuildingId!} buildingName={selectedBuilding?.building_name??""} rooms={rooms} isAdmin={isAdmin} onRefresh={refreshAll} />);
      case "lottery": return protectedContent(<LotteryDraw buildingId={selectedBuildingId!} buildingName={selectedBuilding?.building_name??""} stats={dashboard} allocations={allocations} isAdmin={isAdmin} onRefresh={refreshAll} />);
      case "results": return protectedContent(<AllocationResults buildingId={selectedBuildingId!} allocations={allocations} stats={dashboard} />);
      case "audit": return protectedContent(<AuditLogs audits={audits} />);
      case "report": return protectedContent(<TransparencyReport buildingId={selectedBuildingId!} report={report} />);
      case "residentSearch": return <ResidentSearch />;
      case "residentHistory": return protectedContent(<ResidentHistory buildingId={selectedBuildingId!} buildingName={selectedBuilding?.building_name??""}/>);
      case "drawHistory": return protectedContent(<DrawHistory buildingId={selectedBuildingId!} buildingName={selectedBuilding?.building_name??""}/>);
      case "drawCycleSetup": return protectedContent(<DrawCycleSetup buildingId={selectedBuildingId!} buildingName={selectedBuilding?.building_name??""}/>);
      case "eligibility": return protectedContent(<EligibilityCriteria key={selectedBuildingId} buildingId={selectedBuildingId!} buildingName={selectedBuilding?.building_name??""} residents={residents} />);
      case "admin": return <AdminLogin isAdmin={isAdmin} onLogin={login} onLogout={logout} notice={loginNotice} />;
    }
  })();

  return <Shell activePage={activePage} activeDrawCycleId={activeDrawCycleId} isAdmin={isAdmin} adminEmail={adminEmail} onNavigate={navigate} onLogout={logout}>
    {globalError ? <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{globalError}</div> : null}
    {page}
  </Shell>;
}
