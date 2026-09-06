import { useState, type FormEvent } from "react";
import { Building2 } from "lucide-react";

import { EmptyState } from "../components/EmptyState";
import { StatusPill } from "../components/StatusPill";
import { apiRequest } from "../lib/api";
import type { Room, RoomStatus } from "../types";

interface RoomManagementProps {
  buildingId: number;
  buildingName: string;
  rooms: Room[];
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
}

interface RoomForm {
  room_number: string;
  wing: string;
  floor: number;
  size: string;
  status: RoomStatus;
  suitable_for: string;
}

const initialRoomForm: RoomForm = {
  room_number: "",
  wing: "A",
  floor: 1,
  size: "620 sq ft",
  status: "Available",
  suitable_for: "General"
};

export function RoomManagement({ buildingId, buildingName, rooms, isAdmin, onRefresh }: RoomManagementProps) {
  const [form, setForm] = useState<RoomForm>(initialRoomForm);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submitRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const room = await apiRequest<Room>(`/buildings/${buildingId}/rooms`, {
        method: "POST",
        body: JSON.stringify(form)
      });
      setMessage(`Room ${room.room_number} added successfully.`);
      setForm(initialRoomForm);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Room could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-earth">Room inventory</p>
            <h2 className="mt-2 text-2xl font-bold text-navy">Add available rooms</h2>
            <p className="mt-2 text-sm font-semibold text-earth">Managing rooms for: {buildingName}</p>
          </div>
          <Building2 aria-hidden="true" className="h-8 w-8 text-earth" />
        </div>
        <form className="mt-5 space-y-4" onSubmit={submitRoom}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-slate-700" htmlFor="room_number">
                Room Number
              </label>
              <input
                className="focus-ring mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                id="room_number"
                placeholder="A-101"
                value={form.room_number}
                onChange={(event) => setForm({ ...form, room_number: event.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700" htmlFor="wing">
                Wing
              </label>
              <input
                className="focus-ring mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                id="wing"
                value={form.wing}
                onChange={(event) => setForm({ ...form, wing: event.target.value })}
                required
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-sm font-semibold text-slate-700" htmlFor="floor">
                Floor
              </label>
              <input
                className="focus-ring mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                id="floor"
                min={0}
                type="number"
                value={form.floor}
                onChange={(event) => setForm({ ...form, floor: Number(event.target.value) })}
                required
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700" htmlFor="size">
                Size / Carpet Area
              </label>
              <input
                className="focus-ring mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                id="size"
                value={form.size}
                onChange={(event) => setForm({ ...form, size: event.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700" htmlFor="status">
                Status
              </label>
              <select
                className="focus-ring mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                id="status"
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value as RoomStatus })}
              >
                <option>Available</option>
                <option>Reserved</option>
                <option>Allocated</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700" htmlFor="suitable_for">
              Special Suitability
            </label>
            <input
              className="focus-ring mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              id="suitable_for"
              placeholder="Wheelchair-friendly, lower floor, senior citizen suitable"
              value={form.suitable_for}
              onChange={(event) => setForm({ ...form, suitable_for: event.target.value })}
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
            className="focus-ring w-full rounded-lg bg-earth px-4 py-3 font-semibold text-white hover:bg-forest disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={!isAdmin || saving}
            type="submit"
          >
            {saving ? "Saving room..." : "Add Room"}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-navy">Available Rooms Section</h2>
            <p className="mt-1 text-sm text-slate-600">Track suitability before the AI fairness engine starts matching.</p>
          </div>
          <StatusPill label={`${rooms.length} rooms`} tone="green" />
        </div>
        {rooms.length === 0 ? (
          <div className="mt-5">
            <EmptyState title="No rooms added for this building." detail="Add rooms such as A-101, A-102, A-201, and B-101." />
          </div>
        ) : (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {rooms.map((room) => (
              <article key={room.id} className="rounded-xl border border-slate-200 p-4 transition hover:border-sage hover:bg-cream/50">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-navy">{room.room_number}</h3>
                    <p className="text-sm text-slate-600">
                      Wing {room.wing} • Floor {room.floor} • {room.size}
                    </p>
                  </div>
                  <StatusPill
                    label={room.status}
                    tone={room.status === "Available" ? "green" : room.status === "Reserved" ? "orange" : "purple"}
                  />
                </div>
                <p className="mt-3 text-sm text-slate-600">{room.suitable_for}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
