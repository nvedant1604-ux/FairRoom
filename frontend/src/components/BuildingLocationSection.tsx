import { useMemo, useState } from "react";
import { Copy, ExternalLink, LocateFixed, MapPinned, Navigation, Pencil } from "lucide-react";
import type { Building } from "../types";
import { BuildingLocationMap } from "./BuildingLocationMap";

function hasValidCoordinates(building: Building) {
  return building.latitude !== null && building.longitude !== null &&
    Number.isFinite(building.latitude) && Number.isFinite(building.longitude) &&
    building.latitude >= -90 && building.latitude <= 90 &&
    building.longitude >= -180 && building.longitude <= 180;
}

export function mapsSearchUrl(building: Building) {
  const destination = hasValidCoordinates(building)
    ? `${building.latitude},${building.longitude}`
    : [building.full_address, building.city, building.district, building.state, building.pin_code].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;
}

export function mapsDirectionsUrl(building: Building) {
  const destination = hasValidCoordinates(building)
    ? `${building.latitude},${building.longitude}`
    : [building.full_address, building.city, building.district, building.state, building.pin_code].filter(Boolean).join(", ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

export function BuildingLocationSection({ building, isAdmin }: { building: Building; isAdmin: boolean }) {
  const [copied, setCopied] = useState(false);
  const [recenterRequest, setRecenterRequest] = useState(0);
  const displayAddress = useMemo(
    () => [building.full_address, building.city, building.district, building.state, building.pin_code].filter(Boolean).join(", "),
    [building]
  );
  const details = [
    ["Building Name", building.building_name],
    ["Society Name", building.society_name],
    ["Redevelopment Project", building.redevelopment_project_name],
    ["Full Address", building.full_address],
    ["City", building.city],
    ["District", building.district],
    ["State", building.state],
    ["PIN Code", building.pin_code]
  ];

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(displayAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section aria-labelledby="building-location-heading" className="dashboard-reveal map-card overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft" data-testid="building-location-section">
      <div className="border-b border-slate-200 bg-cream p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-earth">Standard 2D map</p>
            <h2 className="mt-1 text-xl font-bold text-navy" id="building-location-heading">Building Location</h2>
          </div>
          <span className="status-transition rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-bold text-slate-700">
            Location Status: {building.location_status ?? "Not Set"}
          </span>
        </div>
      </div>
      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1.85fr)_minmax(280px,1fr)]">
        <div className="h-[280px] min-w-0 border-b border-slate-200 md:h-[320px] lg:h-full lg:min-h-[380px] lg:border-b-0 lg:border-r">
          <BuildingLocationMap
            administratorCanEdit={false}
            buildingId={building.id}
            buildingName={building.building_name}
            city={building.city}
            district={building.district}
            fullAddress={building.full_address}
            key={building.id}
            latitude={building.latitude ?? null}
            locationStatus={building.location_status ?? "Not Set"}
            longitude={building.longitude ?? null}
            pinCode={building.pin_code}
            projectName={building.redevelopment_project_name}
            recenterRequest={recenterRequest}
            societyName={building.society_name}
            state={building.state}
            zoom={building.map_zoom ?? 17}
          />
        </div>
        <div className="building-details-transition min-w-0 p-5" key={`details-${building.id}`}>
          <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
            {details.map(([label, value]) => (
              <div key={label}>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
                <p className="mt-0.5 break-words text-sm font-semibold text-slate-800">{value || "Not configured"}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <a
              aria-label={`Open ${building.building_name} in Google Maps`}
              className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-earth px-4 py-2 text-sm font-bold text-white hover:bg-forest"
              href={mapsSearchUrl(building)}
              rel="noopener noreferrer"
              target="_blank"
            >
              <ExternalLink aria-hidden="true" className="h-4 w-4" />
              Open in Google Maps
            </a>
            <a
              aria-label={`Get directions to ${building.building_name}`}
              className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-earth px-4 py-2 text-sm font-bold text-white hover:bg-forest"
              href={mapsDirectionsUrl(building)}
              rel="noopener noreferrer"
              target="_blank"
            >
              <Navigation aria-hidden="true" className="h-4 w-4" />
              Get Directions
            </a>
            <button
              aria-label={`Copy address for ${building.building_name}`}
              className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              onClick={() => void copyAddress()}
              type="button"
            >
              <Copy aria-hidden="true" className="h-4 w-4" />
              {copied ? "Address Copied" : "Copy Address"}
            </button>
            <button
              aria-label={`Re-centre map on ${building.building_name}`}
              className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
              disabled={!hasValidCoordinates(building)}
              onClick={() => setRecenterRequest((value) => value + 1)}
              type="button"
            >
              <LocateFixed aria-hidden="true" className="h-4 w-4" />
              Re-centre Map
            </button>
            {isAdmin ? (
              <button
                aria-label={`Edit map location for ${building.building_name}`}
                className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-sage bg-sage-light px-4 py-2 text-sm font-bold text-forest hover:bg-sage sm:col-span-2"
                onClick={() => window.dispatchEvent(new CustomEvent("edit-building", { detail: building.id }))}
                type="button"
              >
                <Pencil aria-hidden="true" className="h-4 w-4" />
                Edit Map Location
              </button>
            ) : null}
          </div>
          {copied ? <p className="mt-3 text-sm font-semibold text-green-700" role="status">Address copied to clipboard.</p> : null}
        </div>
      </div>
    </section>
  );
}

export function BuildingLocationLoading({ buildingName }: { buildingName: string }) {
  return (
    <section aria-labelledby="building-location-heading" className="rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
      <h2 className="text-xl font-bold text-navy" id="building-location-heading">Building Location</h2>
      <div className="mt-4 flex min-h-[280px] items-center justify-center rounded-lg bg-slate-50 text-center" role="status">
        <div>
          <MapPinned aria-hidden="true" className="mx-auto h-8 w-8 text-earth" />
          <p className="mt-3 font-semibold text-slate-700">Loading building location…</p>
          <p className="mt-1 text-sm text-slate-500">{buildingName}</p>
        </div>
      </div>
    </section>
  );
}
