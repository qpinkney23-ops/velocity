"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";

type Underwriter = {
  id: string;
  name?: string;
  email?: string;
  active?: boolean;
  createdAt?: any;
};

type AppRow = {
  id: string;
  underwriterId?: string;
  borrowerName?: string;
  loanAmount?: number;
  status?: string;
  updatedAt?: any;
};

type UWRow = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  assignedCount: number;
  assignedVolume: number;
  inUwOrCond: number;
};

function initials(nameOrEmail: string) {
  const s = (nameOrEmail || "").trim();
  if (!s) return "?";
  const parts = s.includes("@")
    ? s.split("@")[0].split(/[.\-_ ]+/).filter(Boolean)
    : s.split(" ").filter(Boolean);

  const a = (parts[0] || "").slice(0, 1).toUpperCase();
  const b = (parts[1] || parts[0] || "").slice(0, 1).toUpperCase();
  return (a + b).trim() || "?";
}

function Avatar({ label }: { label: string }) {
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold border"
      style={{
        borderColor: "rgba(15,23,42,0.10)",
        background: "linear-gradient(135deg, rgba(31,111,235,0.20), rgba(11,22,49,0.10))",
        color: "rgba(15,23,42,0.78)",
      }}
      title={label}
    >
      {initials(label)}
    </div>
  );
}

export default function UnderwritersPage() {
  const [underwriters, setUnderwriters] = useState<Underwriter[]>([]);
  const [apps, setApps] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [search, setSearch] = useState("");

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) return;

      const qU = query(collection(db, "underwriters"), orderBy("createdAt", "desc"));
      const unsubU = onSnapshot(
        qU,
        (snap) => {
          const list: Underwriter[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
          setUnderwriters(list);
        },
        (e) => setErr(e.message || "Failed to load underwriters")
      );

      const qA = query(collection(db, "applications"), orderBy("updatedAt", "desc"));
      const unsubA = onSnapshot(
        qA,
        (snap) => {
          const list: AppRow[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
          setApps(list);
          setLoading(false);
        },
        (e) => {
          setErr(e.message || "Failed to load applications");
          setLoading(false);
        }
      );

      return () => {
        unsubU();
        unsubA();
      };
    });

    return () => unsubAuth();
  }, []);

  const uwRows: UWRow[] = useMemo(() => {
    const assignedCount = new Map<string, number>();
    const assignedVolume = new Map<string, number>();
    const inUwOrCond = new Map<string, number>();

    for (const a of apps) {
      const uwId = (a.underwriterId || "").trim();
      if (!uwId) continue;

      assignedCount.set(uwId, (assignedCount.get(uwId) ?? 0) + 1);
      assignedVolume.set(uwId, (assignedVolume.get(uwId) ?? 0) + (typeof a.loanAmount === "number" ? a.loanAmount : 0));

      const s = (a.status || "").toLowerCase();
      if (s.includes("uw") || s.includes("condition")) {
        inUwOrCond.set(uwId, (inUwOrCond.get(uwId) ?? 0) + 1);
      }
    }

    return underwriters.map((u) => {
      const name = u.name ?? "—";
      const email = u.email ?? "—";
      const active = u.active !== false;
      return {
        id: u.id,
        name,
        email,
        active,
        assignedCount: assignedCount.get(u.id) ?? 0,
        assignedVolume: assignedVolume.get(u.id) ?? 0,
        inUwOrCond: inUwOrCond.get(u.id) ?? 0,
      };
    });
  }, [underwriters, apps]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return uwRows;
    return uwRows.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [uwRows, search]);

  const totals = useMemo(() => {
    const total = uwRows.length;
    const active = uwRows.filter((u) => u.active).length;
    const assigned = uwRows.reduce((acc, u) => acc + u.assignedCount, 0);
    return { total, active, assigned };
  }, [uwRows]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Underwriters</h1>
          <div className="text-sm v-muted">Manage underwriting capacity and workload.</div>
        </div>

        <div className="flex gap-2">
          <div className="v-chip">{totals.active} active</div>
          <div className="v-chip">{totals.assigned} assigned</div>
        </div>
      </div>

      <div className="v-card-soft p-3">
        <div
          className="flex items-center gap-2 px-3 h-10 rounded-xl border bg-white"
          style={{ borderColor: "var(--v-border)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M21 21l-4.3-4.3m1.8-5.2a7 7 0 11-14 0 7 7 0 0114 0z"
              stroke="rgba(15,23,42,0.55)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <input
            className="w-full outline-none text-sm"
            placeholder="Search underwriters…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="v-chip">{filtered.length}</div>
        </div>
      </div>

      {loading && <div className="v-card p-4">Loading…</div>}

      {!loading && err && (
        <div className="v-card p-4">
          <div className="text-sm text-red-600">Error: {err}</div>
        </div>
      )}

      {!loading && !err && (
        <div className="v-card overflow-hidden">
          <div
            className="px-4 py-3 border-b bg-white flex items-center justify-between"
            style={{ borderColor: "var(--v-border)" }}
          >
            <div className="text-sm font-medium">Team</div>
            <div className="text-xs v-muted">Workload is calculated from assigned applications</div>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b" style={{ borderColor: "var(--v-border)" }}>
                <tr>
                  <th className="text-left p-3">Underwriter</th>
                  <th className="text-left p-3">Email</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Assigned</th>
                  <th className="text-left p-3">In UW/Conditions</th>
                  <th className="text-left p-3">Volume</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((u) => {
                  const label = u.name !== "—" ? u.name : u.email;
                  return (
                    <tr
                      key={u.id}
                      className="border-b last:border-b-0"
                      style={{ borderColor: "var(--v-border)" }}
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Avatar label={label} />
                          <div className="leading-tight">
                            <div className="font-medium">{u.name}</div>
                            <div className="text-xs v-muted">ID: {u.id.slice(0, 8)}…</div>
                          </div>
                        </div>
                      </td>

                      <td className="p-3">{u.email}</td>

                      <td className="p-3">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-md border text-xs ${
                            u.active
                              ? "bg-green-50 text-green-800 border-green-200"
                              : "bg-gray-100 text-gray-700 border-gray-200"
                          }`}
                        >
                          {u.active ? "Active" : "Inactive"}
                        </span>
                      </td>

                      <td className="p-3">
                        <span className="v-chip">{u.assignedCount}</span>
                      </td>

                      <td className="p-3">
                        <span className="v-chip">{u.inUwOrCond}</span>
                      </td>

                      <td className="p-3">
                        {u.assignedVolume ? `$${u.assignedVolume.toLocaleString()}` : "—"}
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td className="p-6 text-sm v-muted" colSpan={6}>
                      No underwriters found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="text-xs v-muted">
        Create/activate/deactivate underwriters in <span className="font-medium">Admin</span>. This page is for
        visibility and workload tracking.
      </div>
    </div>
  );
}
