import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, MapPin, Search } from "lucide-react";
import type { LocationStatus } from "../types";

type MapState = "loading" | "ready" | "disabled" | "missing-key" | "failed" | "invalid" | "empty";

export interface MapLocation {
  latitude: number | null;
  longitude: number | null;
  zoom: number;
  status: LocationStatus;
  googlePlaceId?: string | null;
}

interface BuildingLocationMapProps {
  buildingId?: number | null;
  buildingName: string;
  societyName: string;
  projectName: string;
  fullAddress: string;
  city?: string;
  district?: string;
  state?: string;
  pinCode?: string;
  latitude: number | null;
  longitude: number | null;
  zoom?: number | null;
  locationStatus?: LocationStatus;
  editable?: boolean;
  administratorCanEdit?: boolean;
  recenterRequest?: number;
  onLocationChange?: (location: MapLocation) => void;
}

const DEFAULT_CENTER = { lat: 19.076, lng: 72.8777 };
let mapsPromise: Promise<typeof google.maps> | null = null;

type GeocodingFields = {
  buildingName: string;
  societyName: string;
  fullAddress: string;
  city: string;
  district: string;
  state: string;
  pinCode: string;
};

type GeocodingMatch = {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  placeId?: string;
};

type GeocodingAttempt = {
  status: string;
  match?: GeocodingMatch;
};

function cleanPart(value: string) {
  return value.trim().replace(/\s+/g, " ").replace(/^[,\s]+|[,\s]+$/g, "");
}

function formatAddressParts(values: string[]) {
  const seen = new Set<string>();
  const parts: string[] = [];
  values.flatMap((value) => value.split(",")).forEach((value) => {
    const part = cleanPart(value);
    const key = part.toLocaleLowerCase();
    if (!part || seen.has(key)) return;
    seen.add(key);
    parts.push(part);
  });
  return parts.join(", ");
}

export function buildGeocodingQueries(fields: GeocodingFields) {
  const buildingName = cleanPart(fields.buildingName);
  const societyName = cleanPart(fields.societyName);
  const fullAddress = cleanPart(fields.fullAddress);
  const city = cleanPart(fields.city);
  const district = cleanPart(fields.district);
  const state = cleanPart(fields.state);
  const pinCode = cleanPart(fields.pinCode);
  const normalizeLocality = (value: string) => value.toLocaleLowerCase().replace(/\b(city|district)\b/g, "").replace(/\s+/g, " ").trim();
  const usefulDistrict = normalizeLocality(district) === normalizeLocality(city) ? "" : district;
  const fullAddressLower = fullAddress.toLocaleLowerCase();
  const fullAddressHasState = Boolean(state) && new RegExp(`\\b${state.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").toLocaleLowerCase()}\\b`).test(fullAddressLower);
  const fullAddressHasPin = Boolean(pinCode) && fullAddressLower.includes(pinCode.toLocaleLowerCase());
  const stateAndPin = cleanPart([
    fullAddressHasState ? "" : state,
    fullAddressHasPin ? "" : pinCode
  ].filter(Boolean).join(" "));
  const candidates = [
    [buildingName, societyName, fullAddress, city, usefulDistrict, stateAndPin, "India"],
    [fullAddress, city, usefulDistrict, stateAndPin, "India"],
    [fullAddress, city, stateAndPin, "India"],
    [fullAddress, city, state, "India"],
    [pinCode, city, state, "India"]
  ].map(formatAddressParts);
  const queries: string[] = [];
  const seen = new Set<string>();
  for (const query of candidates) {
    const key = query.toLocaleLowerCase();
    const meaningful = query.replace(/,\s*India$/i, "").trim();
    if (!meaningful || seen.has(key)) continue;
    seen.add(key);
    queries.push(query);
  }
  return queries;
}

function statusMessage(status: string) {
  const messages: Record<string, string> = {
    REQUEST_DENIED: "Address lookup is not authorised. Confirm that the Geocoding API is enabled and permitted for this API key.",
    OVER_QUERY_LIMIT: "The Google Maps address lookup limit has been reached. Please try again later.",
    INVALID_REQUEST: "The address information is incomplete or invalid. Check the address fields and try again.",
    UNKNOWN_ERROR: "Google Maps could not process the address temporarily. Please try again."
  };
  return messages[status] ?? "Building location is temporarily unavailable. Check the internet connection and Google Maps configuration.";
}

function geocodeInBrowser(geocoder: google.maps.Geocoder, address: string): Promise<GeocodingAttempt> {
  return new Promise((resolve) => {
    geocoder.geocode(
      {
        address,
        region: "IN",
        componentRestrictions: { country: "IN" }
      },
      (results, status) => {
        const match = results?.[0];
        if (status !== "OK" || !match) {
          resolve({ status });
          return;
        }
        resolve({
          status,
          match: {
            latitude: match.geometry.location.lat(),
            longitude: match.geometry.location.lng(),
            formattedAddress: match.formatted_address,
            placeId: match.place_id || undefined
          }
        });
      }
    );
  });
}

function validCoordinates(latitude: number | null, longitude: number | null) {
  if (latitude === null || longitude === null) return false;
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

async function loadGoogleMaps(apiKey: string) {
  if (!mapsPromise) {
    mapsPromise = import("@googlemaps/js-api-loader").then(async ({ importLibrary, setOptions }) => {
      setOptions({ key: apiKey, v: "weekly", region: "IN", language: "en" });
      await importLibrary("maps");
      return google.maps;
    });
  }
  return mapsPromise;
}

function StateMessage({ state }: { state: MapState }) {
  const messages: Record<Exclude<MapState, "ready">, string> = {
    loading: "Loading building location…",
    empty: "Map location has not been configured for this building.",
    disabled: "Building map is currently disabled.",
    "missing-key": "Google Maps is not configured for this website.",
    failed: "Building location is temporarily unavailable.",
    invalid: "The saved building coordinates are invalid."
  };
  if (state === "ready") return null;
  return (
    <div className="flex h-full min-h-[280px] items-center justify-center bg-slate-50 p-6 text-center" role="status">
      <div>
        <MapPin aria-hidden="true" className="mx-auto h-8 w-8 text-slate-500" />
        <p className="mt-3 font-semibold text-slate-700">{messages[state]}</p>
      </div>
    </div>
  );
}

export function BuildingLocationMap({
  buildingId,
  buildingName,
  societyName,
  projectName,
  fullAddress,
  city = "",
  district = "",
  state: buildingState = "",
  pinCode = "",
  latitude,
  longitude,
  zoom = 17,
  locationStatus = "Not Set",
  editable = false,
  administratorCanEdit = false,
  recenterRequest = 0,
  onLocationChange
}: BuildingLocationMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const listenersRef = useRef<google.maps.MapsEventListener[]>([]);
  const locationStatusRef = useRef<LocationStatus>(locationStatus);
  locationStatusRef.current = locationStatus;
  const [state, setState] = useState<MapState>("loading");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [pendingLookup, setPendingLookup] = useState<GeocodingMatch | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [formattedAddress, setFormattedAddress] = useState<string | null>(null);
  const [testAttempts, setTestAttempts] = useState<string[]>([]);

  const enabled = import.meta.env.VITE_GOOGLE_MAPS_ENABLED === "true";
  const testMode = import.meta.env.VITE_GOOGLE_MAPS_TEST_MODE === "true";
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? "";
  const safeZoom = Number.isFinite(zoom) && Number(zoom) >= 3 && Number(zoom) <= 20 ? Number(zoom) : 17;
  const hasAnyCoordinate = latitude !== null || longitude !== null;
  const coordinatesValid = validCoordinates(latitude, longitude);
  const addressQueries = useMemo(
    () => buildGeocodingQueries({
      buildingName,
      societyName,
      fullAddress,
      city,
      district,
      state: buildingState,
      pinCode
    }),
    [buildingName, societyName, fullAddress, city, district, buildingState, pinCode]
  );

  function markManual(latitudeValue: number, longitudeValue: number, zoomValue: number) {
    setPendingLookup(null);
    setFormattedAddress(null);
    setLookupError(null);
    setLookupMessage("Pin adjusted manually. Save the building to keep this location.");
    onLocationChange?.({
      latitude: latitudeValue,
      longitude: longitudeValue,
      zoom: zoomValue,
      status: "Manual",
      googlePlaceId: null
    });
  }

  useEffect(() => {
    listenersRef.current.forEach((listener) => listener.remove());
    listenersRef.current = [];
    markerRef.current?.setMap(null);
    markerRef.current = null;
    infoRef.current?.close();
    infoRef.current = null;
    mapRef.current = null;
    setPendingLookup(null);
    setLookupError(null);
    setLookupMessage(null);
    setFormattedAddress(null);
    setTestAttempts([]);
    setState("loading");

    if (testMode) return;
    if (!enabled) {
      setState("disabled");
      return;
    }
    if (!apiKey) {
      setState("missing-key");
      return;
    }
    if (hasAnyCoordinate && !coordinatesValid) {
      setState("invalid");
      return;
    }
    if (!editable && !coordinatesValid) {
      setState("empty");
      return;
    }

    let cancelled = false;
    void loadGoogleMaps(apiKey)
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        const center = coordinatesValid ? { lat: latitude as number, lng: longitude as number } : DEFAULT_CENTER;
        const map = new maps.Map(containerRef.current, {
          center,
          zoom: coordinatesValid ? safeZoom : 11,
          mapTypeId: maps.MapTypeId.ROADMAP,
          mapTypeControl: true,
          mapTypeControlOptions: { mapTypeIds: [maps.MapTypeId.ROADMAP, maps.MapTypeId.SATELLITE] },
          zoomControl: true,
          fullscreenControl: true,
          streetViewControl: false,
          clickableIcons: false,
          gestureHandling: "greedy"
        });
        mapRef.current = map;

        const updateMarker = (position: google.maps.LatLngLiteral, draggable: boolean) => {
          markerRef.current?.setMap(null);
          const marker = new maps.Marker({
            map,
            position,
            draggable,
            title: `${buildingName} building location`
          });
          markerRef.current = marker;
          if (!editable) {
            const content = document.createElement("div");
            const title = document.createElement("strong");
            title.textContent = buildingName;
            const details = document.createElement("p");
            details.textContent = [societyName, projectName, fullAddress].filter(Boolean).join(" · ");
            details.style.maxWidth = "260px";
            content.append(title, details);
            const info = new maps.InfoWindow({ content });
            infoRef.current = info;
            listenersRef.current.push(marker.addListener("click", () => info.open({ map, anchor: marker })));
          } else {
            listenersRef.current.push(marker.addListener("dragend", () => {
              const point = marker.getPosition();
              if (point) markManual(point.lat(), point.lng(), map.getZoom() ?? safeZoom);
            }));
          }
        };

        if (coordinatesValid) updateMarker(center, editable && administratorCanEdit);
        if (editable && administratorCanEdit) {
          listenersRef.current.push(map.addListener("click", (event: google.maps.MapMouseEvent) => {
            const point = event.latLng;
            if (!point) return;
            const position = { lat: point.lat(), lng: point.lng() };
            updateMarker(position, true);
            markManual(position.lat, position.lng, map.getZoom() ?? safeZoom);
          }));
          listenersRef.current.push(map.addListener("zoom_changed", () => {
            if (markerRef.current) {
              onLocationChange?.({
                latitude: markerRef.current.getPosition()?.lat() ?? latitude,
                longitude: markerRef.current.getPosition()?.lng() ?? longitude,
                zoom: map.getZoom() ?? safeZoom,
                status: locationStatusRef.current
              });
            }
          }));
        }
        setState("ready");
      })
      .catch(() => {
        mapsPromise = null;
        if (!cancelled) setState("failed");
      });
    return () => {
      cancelled = true;
      listenersRef.current.forEach((listener) => listener.remove());
      listenersRef.current = [];
      markerRef.current?.setMap(null);
      infoRef.current?.close();
    };
  }, [apiKey, administratorCanEdit, buildingId, editable, enabled, testMode]);

  useEffect(() => {
    if (!mapRef.current || !coordinatesValid) return;
    const position = { lat: latitude as number, lng: longitude as number };
    if (!markerRef.current && editable && administratorCanEdit) {
      const marker = new google.maps.Marker({
        map: mapRef.current,
        position,
        draggable: true,
        title: `${buildingName} building location`
      });
      markerRef.current = marker;
      listenersRef.current.push(marker.addListener("dragend", () => {
        const point = marker.getPosition();
        if (point) markManual(point.lat(), point.lng(), mapRef.current?.getZoom() ?? safeZoom);
      }));
    }
    if (!markerRef.current) return;
    markerRef.current.setPosition(position);
    mapRef.current.setCenter(position);
    mapRef.current.setZoom(safeZoom);
  }, [coordinatesValid, latitude, longitude, safeZoom]);

  useEffect(() => {
    if (!recenterRequest || !mapRef.current || !coordinatesValid) return;
    mapRef.current.setCenter({ lat: latitude as number, lng: longitude as number });
    mapRef.current.setZoom(safeZoom);
    infoRef.current?.close();
  }, [coordinatesValid, latitude, longitude, recenterRequest, safeZoom]);

  async function findAddress() {
    setLookupBusy(true);
    setLookupError(null);
    setLookupMessage("Finding building location…");
    setFormattedAddress(null);
    setPendingLookup(null);
    setTestAttempts([]);

    if (addressQueries.length === 0 || (!cleanPart(fullAddress) && !(cleanPart(pinCode) && cleanPart(city)))) {
      setLookupError("The address information is incomplete or invalid. Check the address fields and try again.");
      setLookupMessage(null);
      setLookupBusy(false);
      return;
    }
    if (!testMode && !apiKey) {
      setLookupError("Google Maps is not configured for this website.");
      setLookupMessage(null);
      setLookupBusy(false);
      return;
    }

    try {
      let geocoder: google.maps.Geocoder | null = null;
      let maps: typeof google.maps | null = null;
      if (!testMode) {
        maps = await loadGoogleMaps(apiKey);
        await import("@googlemaps/js-api-loader").then(({ importLibrary }) => importLibrary("geocoding"));
        geocoder = new maps.Geocoder();
      }

      const scenario = testMode ? sessionStorage.getItem("ai_lottery_maps_test_scenario") ?? "primary-success" : "";
      const runAttempt = async (query: string, queryIndex: number, retry: boolean): Promise<GeocodingAttempt> => {
        if (!testMode && geocoder) return geocodeInBrowser(geocoder, query);
        setTestAttempts((attempts) => [...attempts, query]);
        await Promise.resolve();
        if (scenario === "request-denied") return { status: "REQUEST_DENIED" };
        if (scenario === "over-query-limit") return { status: "OVER_QUERY_LIMIT" };
        if (scenario === "invalid-request") return { status: "INVALID_REQUEST" };
        if (scenario === "unknown-retry-success" && !retry) return { status: "UNKNOWN_ERROR" };
        if (scenario === "unknown-retry-fail") return { status: "UNKNOWN_ERROR" };
        if (scenario === "all-zero-results") return { status: "ZERO_RESULTS" };
        if (scenario === "fallback-success" && queryIndex === 0) return { status: "ZERO_RESULTS" };
        const offset = scenario === "fallback-success" ? 0.001 : 0;
        return {
          status: "OK",
          match: {
            latitude: 19.0178 + offset,
            longitude: 72.8478 + offset,
            formattedAddress: scenario === "fallback-success"
              ? "S. A. Palav Marg, Dadar East, Mumbai, Maharashtra 400014, India"
              : "SRA Shubham, S. A. Palav Marg, Dadar East, Mumbai, Maharashtra 400014, India",
            placeId: scenario === "fallback-success" ? "test-fallback-place" : "test-primary-place"
          }
        };
      };

      let successfulMatch: GeocodingMatch | null = null;
      for (let index = 0; index < addressQueries.length; index += 1) {
        const query = addressQueries[index];
        let attempt = await runAttempt(query, index, false);
        if (attempt.status === "UNKNOWN_ERROR") {
          attempt = await runAttempt(query, index, true);
        }
        if (attempt.status === "ZERO_RESULTS") continue;
        if (attempt.status !== "OK" || !attempt.match) {
          setLookupError(statusMessage(attempt.status));
          setLookupMessage(null);
          return;
        }
        successfulMatch = attempt.match;
        break;
      }

      if (!successfulMatch) {
        setLookupError("Google could not find this address. Check the street, city and PIN code, or select the location manually.");
        setLookupMessage(null);
        return;
      }
      if (!validCoordinates(successfulMatch.latitude, successfulMatch.longitude)) {
        setLookupError("The location returned invalid coordinates. Select the position manually.");
        setLookupMessage(null);
        return;
      }

      setPendingLookup(successfulMatch);
      setFormattedAddress(successfulMatch.formattedAddress);
      setLookupMessage("Location found. Confirm that the pin is placed correctly.");
      onLocationChange?.({
        latitude: successfulMatch.latitude,
        longitude: successfulMatch.longitude,
        zoom: 17,
        status: "Located",
        googlePlaceId: successfulMatch.placeId
      });

      if (maps && mapRef.current) {
        const map = mapRef.current;
        const position = { lat: successfulMatch.latitude, lng: successfulMatch.longitude };
        map.setCenter(position);
        map.setZoom(17);
        markerRef.current?.setMap(null);
        infoRef.current?.close();
        const marker = new maps.Marker({
          map,
          position,
          draggable: true,
          title: `${buildingName} located building position`
        });
        markerRef.current = marker;
        const content = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = buildingName;
        const society = document.createElement("p");
        society.textContent = societyName;
        const address = document.createElement("p");
        address.textContent = successfulMatch.formattedAddress;
        address.style.maxWidth = "280px";
        content.append(title, society, address);
        const info = new maps.InfoWindow({ content });
        infoRef.current = info;
        info.open({ map, anchor: marker });
        listenersRef.current.push(marker.addListener("click", () => info.open({ map, anchor: marker })));
        listenersRef.current.push(marker.addListener("dragend", () => {
          const point = marker.getPosition();
          if (point) markManual(point.lat(), point.lng(), map.getZoom() ?? 17);
        }));
      }
    } catch {
      mapsPromise = null;
      setLookupError("Building location is temporarily unavailable. Check the internet connection and Google Maps configuration.");
      setLookupMessage(null);
    } finally {
      setLookupBusy(false);
    }
  }

  function confirmLookup() {
    if (!pendingLookup) return;
    onLocationChange?.({
      latitude: pendingLookup.latitude,
      longitude: pendingLookup.longitude,
      zoom: mapRef.current?.getZoom() ?? 17,
      status: "Located",
      googlePlaceId: pendingLookup.placeId
    });
    setLookupMessage("Location confirmed. Save the building to keep this location.");
    setPendingLookup(null);
  }

  function recenter() {
    if (!mapRef.current || !coordinatesValid) return;
    mapRef.current.setCenter({ lat: latitude as number, lng: longitude as number });
    mapRef.current.setZoom(safeZoom);
    infoRef.current?.close();
  }

  if (testMode) {
    return (
      <div className="map-surface flex h-full min-h-[280px] flex-col items-center justify-center bg-gradient-to-br from-sage-light to-cream p-6 text-center" data-testid="map-test-mode">
        <MapPin aria-hidden="true" className="h-9 w-9 text-earth" />
        <p className="mt-3 text-lg font-bold text-navy">Map Test Mode</p>
        <p className="mt-1 font-semibold text-slate-700">{buildingName}</p>
        <p className="mt-1 text-sm text-slate-600" data-testid="map-test-coordinates">
          {coordinatesValid ? `${latitude}, ${longitude}` : "Map location has not been configured for this building."}
        </p>
        {editable && administratorCanEdit ? (
          <div className="mt-4 w-full max-w-md rounded-lg bg-white/90 p-3 shadow-sm">
            <button
              aria-label="Find Location from Address"
              className="focus-ring w-full rounded-md bg-earth px-3 py-2 text-sm font-bold text-white hover:bg-forest disabled:bg-slate-400"
              disabled={lookupBusy}
              onClick={() => void findAddress()}
              type="button"
            >
              {lookupBusy ? "Finding building location…" : "Find Location from Address"}
            </button>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <button
                aria-label="Simulate map click"
                className="focus-ring rounded-md border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700"
                onClick={() => markManual(19.031, 72.861, 17)}
                type="button"
              >
                Simulate map click
              </button>
              <button
                aria-label="Simulate marker drag"
                className="focus-ring rounded-md border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700"
                onClick={() => markManual(19.041, 72.871, 17)}
                type="button"
              >
                Simulate marker drag
              </button>
            </div>
            {pendingLookup ? (
              <button
                className="focus-ring mt-2 w-full rounded-md bg-green-700 px-3 py-2 text-xs font-bold text-white"
                onClick={confirmLookup}
                type="button"
              >
                Confirm Address Result
              </button>
            ) : null}
            {lookupMessage ? <p className="mt-2 text-sm font-semibold text-green-800" role="status">{lookupMessage}</p> : null}
            {formattedAddress ? <p className="mt-1 text-xs text-slate-700" data-testid="geocoding-formatted-address">{formattedAddress}</p> : null}
            {lookupError ? <p className="mt-2 text-sm font-semibold text-red-700" role="alert">{lookupError}</p> : null}
            <p className="sr-only" data-testid="geocoding-attempt-count">{testAttempts.length}</p>
            <ol className="sr-only" data-testid="geocoding-attempts">
              {testAttempts.map((query, index) => <li key={`${index}-${query}`}>{query}</li>)}
            </ol>
          </div>
        ) : null}
        {!apiKey ? <p className="mt-2 text-xs text-slate-500">Google Maps is not configured for this website.</p> : null}
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[280px] overflow-hidden">
      <div
        aria-label={`Interactive map for ${buildingName}`}
        className={`map-surface h-full min-h-[280px] w-full ${state === "ready" ? "block" : "invisible absolute inset-0"}`}
        ref={containerRef}
        role="application"
      />
      {state !== "ready" ? <StateMessage state={state} /> : null}
      {state === "ready" && coordinatesValid ? (
        <button
          aria-label={`Re-centre map on ${buildingName}`}
          className="focus-ring absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-bold text-forest shadow-lg"
          onClick={recenter}
          type="button"
        >
          <Crosshair aria-hidden="true" className="h-4 w-4" />
          Re-centre
        </button>
      ) : null}
      {editable && state === "ready" ? (
        <div className="absolute left-3 top-3 max-w-[calc(100%-1.5rem)] rounded-lg bg-white/95 p-3 shadow-lg">
          <p className="text-xs font-semibold text-slate-700">Click the map or drag the marker to select a location.</p>
          <button
            aria-label="Find Location from Address"
            className="focus-ring mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md bg-earth px-3 py-2 text-xs font-bold text-white hover:bg-forest disabled:bg-slate-400"
            disabled={lookupBusy}
            onClick={() => void findAddress()}
            type="button"
          >
            <Search aria-hidden="true" className="h-4 w-4" />
            {lookupBusy ? "Finding building location…" : "Find Location from Address"}
          </button>
          {pendingLookup ? (
            <button
              className="focus-ring mt-2 w-full rounded-md bg-green-700 px-3 py-2 text-xs font-bold text-white hover:bg-green-800"
              onClick={confirmLookup}
              type="button"
            >
              Confirm Address Result
            </button>
          ) : null}
          {lookupMessage ? <p className="mt-2 max-w-sm text-xs font-semibold text-green-800" role="status">{lookupMessage}</p> : null}
          {formattedAddress ? <p className="mt-1 max-w-sm text-xs text-slate-700">{formattedAddress}</p> : null}
          {lookupError ? <p className="mt-2 max-w-sm text-xs font-semibold text-red-700" role="alert">{lookupError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
