import { useState, type FormEvent } from "react";
import { CheckCircle2, FileUp, ShieldAlert } from "lucide-react";

import { EmptyState } from "../components/EmptyState";
import { StatusPill } from "../components/StatusPill";
import { apiRequest } from "../lib/api";
import type { PriorityCategory, Resident } from "../types";

const categories: PriorityCategory[] = [
  "Senior Citizen",
  "Disabled",
  "Widow",
  "Medical Emergency",
  "Large Family",
  "General"
];

interface ResidentRegistrationProps {
  buildingId: number;
  buildingName: string;
  residents: Resident[];
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
}

interface ResidentForm {
  full_name: string;
  aadhaar_number: string;
  old_room_number: string;
  family_members: number;
  contact_number: string;
  priority_category: PriorityCategory;
  building_wing: string;
  document_name: string;
  consent: boolean;
  date_of_birth: string;
  residency_start_date: string;
  resident_category: string;
  annual_income: string;
  portal_password: string;
}

const initialForm: ResidentForm = {
  full_name: "",
  aadhaar_number: "",
  old_room_number: "",
  family_members: 1,
  contact_number: "",
  priority_category: "General",
  building_wing: "A",
  document_name: "",
  consent: false,
  date_of_birth: "",
  residency_start_date: "",
  resident_category: "",
  annual_income: "",
  portal_password: ""
};

export function ResidentRegistration({ buildingId, buildingName, residents, isAdmin, onRefresh }: ResidentRegistrationProps) {
  const [form, setForm] = useState<ResidentForm>(initialForm);
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [portalResidentId, setPortalResidentId] = useState<number | null>(null);
  const [portalPassword, setPortalPassword] = useState("");

  async function submitResident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    setWarnings([]);

    try {
      const response = await apiRequest<{ resident: Resident; warnings: string[] }>(`/buildings/${buildingId}/residents`, {
        method: "POST",
        body: JSON.stringify({ ...form, date_of_birth: form.date_of_birth || null,
          residency_start_date: form.residency_start_date || null,
          resident_category: form.resident_category || null,
          annual_income: form.annual_income === "" ? null : Number(form.annual_income),
          portal_password: form.portal_password || null })
      });
      setMessage(`${response.resident.full_name} saved. Resident login ID: ${response.resident.id}.${form.portal_password ? " Portal password is ready." : " Set a portal password when ready."}`);
      setWarnings(response.warnings);
      setForm(initialForm);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resident could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function updateVerification(residentId: number, status: "verify" | "reject") {
    setError(null);
    try {
      await apiRequest(`/buildings/${buildingId}/residents/${residentId}/${status}`, { method: "POST" });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resident status could not be updated.");
    }
  }

  async function savePortalPassword(residentId: number) {
    setError(null);
    try {
      await apiRequest(`/buildings/${buildingId}/residents/${residentId}/portal-password`, {
        method: "PUT", body: JSON.stringify({ password: portalPassword })
      });
      setPortalResidentId(null); setPortalPassword("");
      setMessage(`Portal password updated for resident ID ${residentId}. Share it privately with the resident.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Portal password could not be updated."); }
  }

  function statusTone(status: string) {
    if (status === "Verified") return "green";
    if (status === "Rejected") return "red";
    return "orange";
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-earth">Housing application</p>
            <h2 className="mt-2 text-2xl font-bold text-navy">Add and verify residents</h2>
          </div>
          <StatusPill label={isAdmin ? "Admin enabled" : "Login required"} tone={isAdmin ? "green" : "orange"} />
        </div>
        <p className="mt-3 rounded-lg border border-sage bg-sage-light/50 px-3 py-2 text-sm font-semibold text-forest">Registering resident for: {buildingName}</p>

        <form className="mt-5 space-y-4" onSubmit={submitResident}>
          <div>
            <label className="text-sm font-semibold text-slate-700" htmlFor="full_name">
              Full Name
            </label>
            <input
              className="focus-ring mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              id="full_name"
              value={form.full_name}
              onChange={(event) => setForm({ ...form, full_name: event.target.value })}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-slate-700" htmlFor="aadhaar_number">
                Aadhaar Number / ID Number
              </label>
              <input
                className="focus-ring mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                id="aadhaar_number"
                value={form.aadhaar_number}
                onChange={(event) => setForm({ ...form, aadhaar_number: event.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700" htmlFor="old_room_number">
                Old Room Number
              </label>
              <input
                className="focus-ring mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                id="old_room_number"
                value={form.old_room_number}
                onChange={(event) => setForm({ ...form, old_room_number: event.target.value })}
                required
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="text-sm font-semibold text-slate-700" htmlFor="date_of_birth">Date of Birth (optional)</label><input className="focus-ring mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" id="date_of_birth" type="date" value={form.date_of_birth} onChange={event => setForm({...form,date_of_birth:event.target.value})}/></div>
            <div><label className="text-sm font-semibold text-slate-700" htmlFor="residency_start_date">Residency Start Date (optional)</label><input className="focus-ring mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" id="residency_start_date" type="date" value={form.residency_start_date} onChange={event => setForm({...form,residency_start_date:event.target.value})}/></div>
            <div><label className="text-sm font-semibold text-slate-700" htmlFor="resident_category">Policy Category (optional)</label><input className="focus-ring mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" id="resident_category" value={form.resident_category} onChange={event => setForm({...form,resident_category:event.target.value})}/></div>
            <div><label className="text-sm font-semibold text-slate-700" htmlFor="annual_income">Annual Income (optional, admin only)</label><input className="focus-ring mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" id="annual_income" min="0" type="number" step="0.01" value={form.annual_income} onChange={event => setForm({...form,annual_income:event.target.value})}/></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-sm font-semibold text-slate-700" htmlFor="family_members">
                Family Members
              </label>
              <input
                className="focus-ring mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                id="family_members"
                min={1}
                type="number"
                value={form.family_members}
                onChange={(event) => setForm({ ...form, family_members: Number(event.target.value) })}
                required
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700" htmlFor="contact_number">
                Contact Number
              </label>
              <input
                className="focus-ring mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                id="contact_number"
                value={form.contact_number}
                onChange={(event) => setForm({ ...form, contact_number: event.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700" htmlFor="building_wing">
                Building/Wing
              </label>
              <input
                className="focus-ring mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                id="building_wing"
                value={form.building_wing}
                onChange={(event) => setForm({ ...form, building_wing: event.target.value })}
                required
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700" htmlFor="portal_password">Resident portal password (optional)</label>
            <input className="focus-ring mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              id="portal_password" type="password" minLength={12} autoComplete="new-password"
              value={form.portal_password} onChange={event => setForm({...form, portal_password:event.target.value})} />
            <p className="mt-1 text-xs text-slate-500">At least 12 characters. Give the resident their ID and password privately.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-slate-700" htmlFor="priority_category">
                Priority Category
              </label>
              <select
                className="focus-ring mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                id="priority_category"
                value={form.priority_category}
                onChange={(event) =>
                  setForm({ ...form, priority_category: event.target.value as PriorityCategory })
                }
              >
                {categories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700" htmlFor="document_upload">
                Document Upload
              </label>
              <label className="focus-ring mt-1 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600">
                <FileUp aria-hidden="true" className="h-4 w-4" />
                {form.document_name || "Choose verification document"}
                <input
                  className="sr-only"
                  id="document_upload"
                  type="file"
                  onChange={(event) =>
                    setForm({ ...form, document_name: event.target.files?.[0]?.name ?? "" })
                  }
                />
              </label>
            </div>
          </div>
          <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <input
              className="mt-1"
              checked={form.consent}
              onChange={(event) => setForm({ ...form, consent: event.target.checked })}
              type="checkbox"
              required
            />
            Resident consent is collected for transparent lottery processing and audit reporting.
          </label>
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          ) : null}
          {message ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-700">
              <CheckCircle2 aria-hidden="true" className="mr-2 inline h-4 w-4" />
              {message}
            </div>
          ) : null}
          {warnings.length > 0 ? (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
              <ShieldAlert aria-hidden="true" className="mr-2 inline h-4 w-4" />
              {warnings.join(" ")}
            </div>
          ) : null}
          <button
            className="focus-ring w-full rounded-lg bg-earth px-4 py-3 font-semibold text-white hover:bg-forest disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={!isAdmin || saving}
            type="submit"
          >
            {saving ? "Saving resident..." : "Save Resident"}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-navy">Resident List</h2>
            <p className="mt-1 text-sm text-slate-600">Aadhaar is stored only as masked value plus backend hash.</p>
          </div>
          <StatusPill label={`${residents.length} residents`} tone="blue" />
        </div>
        {residents.length === 0 ? (
          <div className="mt-5">
            <EmptyState title="No residents registered for this building." detail="Use the registration form to add residents." />
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-sage-light text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">Resident</th>
                  <th className="px-3 py-3">Masked Aadhaar</th>
                  <th className="px-3 py-3">Old Room</th>
                  <th className="px-3 py-3">Priority</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {residents.map((resident) => (
                  <tr key={resident.id}>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-navy">{resident.full_name}</p>
                      <p className="text-xs text-slate-500">{resident.contact_number}</p>
                    </td>
                    <td className="px-3 py-3">{resident.aadhaar_masked}</td>
                    <td className="px-3 py-3">{resident.old_room_number}</td>
                    <td className="px-3 py-3">{resident.priority_category}</td>
                    <td className="px-3 py-3">
                      <StatusPill
                        label={resident.verification_status}
                        tone={statusTone(resident.verification_status)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <p className="mb-2 text-xs font-semibold text-slate-500">Login ID: {resident.id}</p>
                      <button className="focus-ring mb-2 rounded-md border border-sage px-2 py-1 text-xs font-semibold text-forest"
                        type="button" onClick={() => { setPortalResidentId(resident.id); setPortalPassword(""); }}>Set portal password</button>
                      {portalResidentId === resident.id ? <div className="mb-2 flex min-w-40 flex-col gap-2">
                        <input aria-label={`Portal password for ${resident.full_name}`} className="rounded-lg border px-2 py-1"
                          type="password" minLength={12} autoComplete="new-password" value={portalPassword}
                          onChange={event => setPortalPassword(event.target.value)} />
                        <button className="rounded-lg bg-earth px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                          disabled={portalPassword.length < 12} onClick={() => void savePortalPassword(resident.id)} type="button">Save password</button>
                      </div> : null}
                      {resident.verification_status === "Verified" ? (
                        <span className="text-xs font-semibold text-slate-500">Ready</span>
                      ) : resident.verification_status === "Rejected" ? (
                        <span className="text-xs font-semibold text-red-600">Rejected</span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="focus-ring rounded-md bg-green-700 px-3 py-2 text-xs font-semibold text-white hover:bg-green-800 disabled:bg-slate-400"
                            disabled={!isAdmin}
                            onClick={() => updateVerification(resident.id, "verify")}
                            type="button"
                          >
                            Verify
                          </button>
                          <button
                            className="focus-ring rounded-md border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:bg-slate-100 disabled:text-slate-400"
                            disabled={!isAdmin}
                            onClick={() => updateVerification(resident.id, "reject")}
                            type="button"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
