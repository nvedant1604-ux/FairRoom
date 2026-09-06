import { useEffect, useState, type FormEvent } from "react";
import { MapPin, Plus, Trash2 } from "lucide-react";
import { useBuilding } from "../context/BuildingContext";
import type { BuildingInput } from "../types";
import { BuildingLocationMap, type MapLocation } from "./BuildingLocationMap";

const empty: BuildingInput = {
  building_name: "",
  society_name: "",
  redevelopment_project_name: "",
  full_address: "",
  city: "",
  district: "",
  state: "Maharashtra",
  pin_code: "",
  number_of_wings: 0,
  description: "",
  latitude: null,
  longitude: null,
  map_zoom: 17,
  location_status: "Not Set",
  google_place_id: null
};

const textFields: Array<[keyof BuildingInput, string]> = [
  ["building_name", "Building Name"],
  ["society_name", "Society Name"],
  ["redevelopment_project_name", "Redevelopment Project Name"],
  ["full_address", "Full Address"],
  ["city", "City"],
  ["district", "District"],
  ["state", "State"],
  ["pin_code", "PIN Code"],
  ["number_of_wings", "Number of Wings"],
  ["description", "Description"]
];

export function BuildingControls({ isAdmin }: { isAdmin: boolean }) {
  const { buildings, selectedBuildingId, selectBuilding, addBuilding, updateBuilding } = useBuilding();
  const [open, setOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [form, setForm] = useState<BuildingInput>(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editId, setEditId] = useState<number | null>(null);

  useEffect(() => {
    const add = () => {
      setEditId(null);
      setForm({ ...empty });
      setError(null);
      setMapOpen(false);
      setOpen(true);
    };
    const edit = (event: Event) => {
      const id = (event as CustomEvent<number>).detail;
      const item = buildings.find((building) => building.id === id);
      if (!item) return;
      setEditId(id);
      setForm({
        building_name: item.building_name,
        society_name: item.society_name,
        redevelopment_project_name: item.redevelopment_project_name,
        full_address: item.full_address,
        city: item.city,
        district: item.district,
        state: item.state,
        pin_code: item.pin_code,
        number_of_wings: item.number_of_wings,
        description: item.description,
        latitude: item.latitude ?? null,
        longitude: item.longitude ?? null,
        map_zoom: item.map_zoom ?? 17,
        location_status: item.location_status ?? "Not Set",
        google_place_id: item.google_place_id ?? null
      });
      setError(null);
      setMapOpen(true);
      setOpen(true);
    };
    window.addEventListener("add-building", add);
    window.addEventListener("edit-building", edit);
    return () => {
      window.removeEventListener("add-building", add);
      window.removeEventListener("edit-building", edit);
    };
  }, [buildings]);

  function updateLocation(location: MapLocation) {
    setForm((current) => ({
      ...current,
      latitude: location.latitude,
      longitude: location.longitude,
      map_zoom: location.zoom,
      location_status: location.status,
      ...(location.googlePlaceId !== undefined ? { google_place_id: location.googlePlaceId } : {})
    }));
  }

  function clearLocation() {
    setForm((current) => ({
      ...current,
      latitude: null,
      longitude: null,
      map_zoom: 17,
      location_status: "Not Set",
      google_place_id: null
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if ((form.latitude === null) !== (form.longitude === null)) {
        throw new Error("Latitude and longitude must both be provided or both be left empty.");
      }
      const normalized: BuildingInput = {
        ...form,
        location_status: form.latitude === null ? "Not Set" : form.location_status === "Not Set" ? "Manual" : form.location_status
      };
      const result = editId ? await updateBuilding(editId, normalized) : await addBuilding(normalized);
      setMessage(result);
      setOpen(false);
      setMapOpen(false);
      setForm({ ...empty });
      setEditId(null);
      window.dispatchEvent(new Event("building-updated"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Building could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-sage bg-white px-3 py-2 shadow-sm">
        <label className="shrink-0 text-xs font-bold uppercase tracking-wide text-earth" htmlFor="building-selector">Current Building:</label>
        <select
          className="min-w-0 flex-1 bg-white text-sm font-semibold text-navy xl:max-w-56"
          id="building-selector"
          onChange={(event) => selectBuilding(Number(event.target.value))}
          value={selectedBuildingId ?? ""}
        >
          {buildings.map((building) => (
            <option key={building.id} value={building.id}>
              {building.building_name} — {building.society_name} — {building.city}
            </option>
          ))}
        </select>
        {isAdmin ? (
          <button
            aria-label="Add Building"
            className="focus-ring shrink-0 rounded-md bg-earth px-2 py-1 text-xs font-bold text-white hover:bg-forest"
            onClick={() => window.dispatchEvent(new Event("add-building"))}
            type="button"
          >
            <Plus aria-hidden="true" className="mr-1 inline h-3 w-3" />
            Add Building
          </button>
        ) : null}
      </div>
      {message ? <span className="text-xs font-semibold text-green-700" role="status">{message}</span> : null}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-4">
          <form className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-5 shadow-soft sm:p-6" onSubmit={submit}>
            <h2 className="text-2xl font-bold text-navy">{editId ? "Edit Building" : "Add Building"}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {textFields.map(([key, label]) => (
                <label className="text-sm font-semibold text-slate-700" key={key}>
                  {label}
                  <input
                    aria-label={label}
                    className="focus-ring mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                    min={key === "number_of_wings" ? 0 : undefined}
                    onChange={(event) => setForm({
                      ...form,
                      [key]: key === "number_of_wings" ? Number(event.target.value) : event.target.value
                    })}
                    required={key !== "description" && key !== "number_of_wings"}
                    type={key === "number_of_wings" ? "number" : "text"}
                    value={String(form[key])}
                  />
                </label>
              ))}
            </div>

            <section aria-labelledby="map-location-form-heading" className="mt-6 rounded-xl border border-sage bg-sage-light/45 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-bold text-navy" id="map-location-form-heading">Map Location</h3>
                  <p className="mt-1 text-sm text-slate-600">Coordinates are optional. Select a point manually or find it from the address.</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    aria-label="Select Location on Map"
                    className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-earth px-4 py-2 text-sm font-bold text-white hover:bg-forest"
                    onClick={() => setMapOpen((current) => !current)}
                    type="button"
                  >
                    <MapPin aria-hidden="true" className="h-4 w-4" />
                    {mapOpen ? "Hide Location Map" : "Select Location on Map"}
                  </button>
                  <button
                    aria-label="Clear Location"
                    className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50"
                    onClick={clearLocation}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                    Clear Location
                  </button>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <label className="text-sm font-semibold text-slate-700">
                  Latitude
                  <input
                    aria-label="Latitude"
                    className="focus-ring mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    max={90}
                    min={-90}
                    onChange={(event) => setForm({ ...form, latitude: event.target.value === "" ? null : Number(event.target.value), location_status: event.target.value === "" ? "Not Set" : "Manual" })}
                    step="any"
                    type="number"
                    value={form.latitude ?? ""}
                  />
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Longitude
                  <input
                    aria-label="Longitude"
                    className="focus-ring mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    max={180}
                    min={-180}
                    onChange={(event) => setForm({ ...form, longitude: event.target.value === "" ? null : Number(event.target.value), location_status: event.target.value === "" ? "Not Set" : "Manual" })}
                    step="any"
                    type="number"
                    value={form.longitude ?? ""}
                  />
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Map Zoom
                  <input
                    aria-label="Map Zoom"
                    className="focus-ring mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    max={20}
                    min={3}
                    onChange={(event) => setForm({ ...form, map_zoom: Number(event.target.value) })}
                    type="number"
                    value={form.map_zoom}
                  />
                </label>
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-700">Location Status: {form.location_status}</p>
              {mapOpen ? (
                <div className="map-edit-frame mt-4 overflow-hidden rounded-lg border border-slate-300 bg-white">
                  <BuildingLocationMap
                    administratorCanEdit={isAdmin}
                    buildingId={editId}
                    buildingName={form.building_name || "New building"}
                    city={form.city}
                    district={form.district}
                    editable
                    fullAddress={form.full_address}
                    latitude={form.latitude}
                    locationStatus={form.location_status}
                    longitude={form.longitude}
                    onLocationChange={updateLocation}
                    pinCode={form.pin_code}
                    projectName={form.redevelopment_project_name}
                    societyName={form.society_name}
                    state={form.state}
                    zoom={form.map_zoom}
                  />
                </div>
              ) : null}
            </section>

            {error ? <p className="mt-3 text-sm font-semibold text-red-700" role="alert">{error}</p> : null}
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button className="focus-ring min-h-11 rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700" onClick={() => setOpen(false)} type="button">
                Cancel
              </button>
              <button className="focus-ring min-h-11 rounded-lg bg-earth px-4 py-2 font-bold text-white hover:bg-forest disabled:bg-slate-400" disabled={saving} type="submit">
                {saving ? (editId ? "Saving Building…" : "Adding Building…") : (editId ? "Save Building" : "Add Building")}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
