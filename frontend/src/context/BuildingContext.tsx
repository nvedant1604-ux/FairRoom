import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiRequest, getAdminToken } from "../lib/api";
import type { Building, BuildingInput } from "../types";

const KEY = "ai_lottery_selected_building_id";
interface Value {
  buildings: Building[]; selectedBuilding: Building | null; selectedBuildingId: number | null;
  loading: boolean; error: string | null; selectBuilding: (id: number) => void;
  refreshBuildings: () => Promise<void>; addBuilding: (input: BuildingInput) => Promise<string>;
  updateBuilding: (id: number, input: BuildingInput) => Promise<string>; archiveBuilding: (id: number) => Promise<void>;
}
const BuildingContext = createContext<Value | null>(null);

export function BuildingProvider({ children }: { children: ReactNode }) {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedBuildingId, setSelectedId] = useState<number | null>(() => Number(localStorage.getItem(KEY)) || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshBuildings = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const path = getAdminToken() ? "/buildings" : "/public/buildings";
      const data = await apiRequest<Building[]>(path); setBuildings(data);
      setSelectedId((current) => {
        const next = data.some((item) => item.id === current) ? current : data[0]?.id ?? null;
        if (next) localStorage.setItem(KEY, String(next)); else localStorage.removeItem(KEY);
        return next;
      });
    } catch (err) { setError(err instanceof Error ? err.message : "Buildings could not be loaded."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refreshBuildings(); }, [refreshBuildings]);
  const selectBuilding = useCallback((id: number) => { localStorage.setItem(KEY, String(id)); setSelectedId(id); }, []);
  const addBuilding = useCallback(async (input: BuildingInput) => {
    const result = await apiRequest<{message:string;building:Building}>("/buildings", { method:"POST", body:JSON.stringify(input) });
    await refreshBuildings(); selectBuilding(result.building.id); return result.message;
  }, [refreshBuildings, selectBuilding]);
  const updateBuilding = useCallback(async (id:number,input:BuildingInput) => { const result=await apiRequest<{message:string}>(`/buildings/${id}`,{method:"PUT",body:JSON.stringify(input)}); await refreshBuildings(); return result.message; },[refreshBuildings]);
  const archiveBuilding = useCallback(async (id:number) => { await apiRequest(`/buildings/${id}/archive`,{method:"POST"}); await refreshBuildings(); },[refreshBuildings]);
  const selectedBuilding = buildings.find((item) => item.id === selectedBuildingId) ?? null;
  const value = useMemo(() => ({buildings,selectedBuilding,selectedBuildingId,loading,error,selectBuilding,refreshBuildings,addBuilding,updateBuilding,archiveBuilding}),[buildings,selectedBuilding,selectedBuildingId,loading,error,selectBuilding,refreshBuildings,addBuilding,updateBuilding,archiveBuilding]);
  return <BuildingContext.Provider value={value}>{children}</BuildingContext.Provider>;
}

export function useBuilding() { const value=useContext(BuildingContext); if(!value) throw new Error("BuildingProvider is missing."); return value; }
