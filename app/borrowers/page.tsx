"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";

type AppRow = {
  id: string;
  borrowerName?: string;
  email?: string;
  loanAmount?: number;
  status?: string;
  updatedAt?: any;
  createdAt?: any;
};

type BorrowerRow = {
  key: string; // email (preferred) or fallback key
  borrowerName: string;
  email: string;
  applications: number;
  totalVolume: number;
  latestStatus: string;
  latestUpdatedMs: number;
};

function money(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

function initials(name: string, email: string) {
  const base = (name || "").trim();
  if (base.length) {
    const parts = base.split(/\s+/).filter(Boolean);
    const a = (parts[0]?.[0] || "").toUpperCase();
    const b = (parts[1]?.[0] || "").toUpperCase();
    return (a + b) || a || "B";
  }
  const e = (email || "").trim();
  return (e.slice(0, 2) || "B").toUpperCase();
}

function tsToMs(ts: any): number {
  if (!ts) return 0;
  const d = typeof ts?.toDate === "function" ? ts.toDate() : null;
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return 0;
  return d.getTime();
}

function chipTone(status: string) {
  const s = (status || "").toLowerCase();
  if (s.includes("approve")) return "bg-green-50 border-green-200 text-green-800";
  if (s.includes("deny") || s.includes("decline")) return "bg-red-50 border-red-200 text-red-700";
  if (s.includes("condition")) return "bg-amber-50 border-amber-200 text-amber-800";
  if (s.includes("review") || s.includes("uw")) return "bg-blue-50 border-blue-200 text-blue-800";
  if (s.includes("new")) return "bg-gray-100 border-gray-200 text-gray-700";
  return "bg-gray-100 border-gray-200 text-gray-700";
}

export default function BorrowersPage() {
  const [apps, setApps] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [qText, setQText] = useState("");

  useEffect(() => {
    const q = query(collection(db, "applications"), orderBy("updatedAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: AppRow[] = [];
        snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
        setApps(rows);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, []);

  const borrowers = useMemo(() => {
    const map = new Map<string, BorrowerRow>();

    for (const a of apps) {
      const emailRaw = (a.email || "").toString().trim().toLowerCase();
      const nameRaw = (a.borrowerName || "").toString().trim();

      // Key strategy:
      // - Prefer email as stable borrower key
      // - Fallback to app id key if missing email (still shows up, but grouped as unique)
      const key = emailRaw || `missing_email:${a.id}`;

      const updatedMs = Math.max(tsToMs(a.updatedAt), tsToMs(a.createdAt));

      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          borrowerName: nameRaw || (emailRaw ? emailRaw.split("@")[0] : "Unknown borrower"),
          email: emailRaw || "—",
          applications: 1,
          totalVolume: typeof a.loanAmount === "number" ? a.loanAmount : 0,
          latestStatus: (a.status || "New").toString(),
          latestUpdatedMs: updatedMs,
        });
      } else {
        existing.applications += 1;
        existing.totalVolume += typeof a.loanAmount === "number" ? a.loanAmount : 0;

        // Prefer best borrower name we have
        if (nameRaw && (existing.borrowerName === "Unknown borrower" || existing.borrowerName.includes("@"))) {
          existing.borrowerName = nameRaw;
        }

        // Update latest status if this app is newer
        if (updatedMs >= existing.latestUpdatedMs) {
          existing.latestUpdatedMs = updatedMs;
          existing.latestStatus = (a.status || existing.latestStatus || "New").toString();
        }
      }
    }

    const list = Array.from(map.values());

    // Sort by most recent activity
    list.sort((a, b) => b.latestUpdatedMs - a.latestUpdatedMs);

    return list;
  }, [apps]);

  const filtered = useMemo(() => {
    const q = qText.trim().toLowerCase();
    if (!q) return borrowers;
    return borrowers.filter((b) => {
      return (
        b.borrowerName.toLowerCase().includes(q) ||
        (b.email || "").toLowerCase().includes(q) ||
        b.latestStatus.toLowerCase().includes(q)
      );
    });
  }, [borrowers, qText]);

  const totalApps = apps.length;
  const totalVolume = useMemo(() => {
    return apps.reduce((acc, a) => acc + (typeof a.loanAmount === "number" ? a.loanAmount : 0), 0);
  }, [apps]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Borrowers</h1>
          <div className="text-sm v-muted">Borrower directory auto-generated from applications.</div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="v-chip">{`${filtered.length} borrowers`}</span>
          <span className="v-chip">{`${totalApps} apps`}</span>
          <span className="v-chip">{money(totalVolume)} volume</span>
        </div>
      </div>

      <div className="v-card p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[240px]">
            <input
              className="w-full border rounded-xl p-2 bg-white text-sm"
              style={{ borderColor: "rgba(15,23,42,0.10)" }}
              value={qText}
              onChange={(e) => setQText(e.target.value)}
              placeholder="Search borrower name or email…"
            />
          </div>

          <div className="text-xs v-muted">{loading ? "Loading…" : `${filtered.length} results`}</div>
        </div>
      </div>

      <div className="v-card overflow-hidden">
        <div
          className="px-4 py-3 border-b bg-white flex items-center justify-between"
          style={{ borderColor: "var(--v-border)" }}
        >
          <div className="text-sm font-medium">Directory</div>
          <div className="text-xs v-muted">{loading ? "Syncing…" : "Live"}</div>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b" style={{ borderColor: "var(--v-border)" }}>
              <tr>
                <th className="text-left p-3">Borrower</th>
                <th className="text-left p-3">Applications</th>
                <th className="text-left p-3">Total Volume</th>
                <th className="text-left p-3">Latest Status</th>
                <th className="text-right p-3">Action</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((b) => (
                <tr
                  key={b.key}
                  className="border-b last:border-b-0"
                  style={{ borderColor: "var(--v-border)" }}
                >
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full border flex items-center justify-center text-xs font-semibold"
                        style={{
                          borderColor: "rgba(15,23,42,0.12)",
                          background: "rgba(31,111,235,0.10)",
                          color: "rgba(15,23,42,0.85)",
                        }}
                        title={b.borrowerName}
                      >
                        {initials(b.borrowerName, b.email)}
                      </div>

                      <div className="min-w-0">
                        <div className="font-medium truncate">{b.borrowerName || "Unknown borrower"}</div>
                        <div className="text-xs v-muted truncate">{b.email || "—"}</div>
                      </div>
                    </div>
                  </td>

                  <td className="p-3">{b.applications}</td>

                  <td className="p-3">{money(b.totalVolume)}</td>

                  <td className="p-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded-md border text-xs ${chipTone(b.latestStatus)}`}>
                      {b.latestStatus || "New"}
                    </span>
                  </td>

                  <td className="p-3 text-right">
                    <button
                      className="v-btn"
                      onClick={() => {
                        // For V1, Borrowers is derived-only.
                        // Later we can route to a borrower detail page.
                        alert("Borrower detail page is Phase 2 (optional).");
                      }}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td className="p-8 text-sm v-muted" colSpan={5}>
                    No borrowers match your search.
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td className="p-8 text-sm v-muted" colSpan={5}>
                    Loading borrowers…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="v-card p-4">
        <div className="text-sm font-medium">Notes</div>
        <div className="text-xs v-muted mt-1">
          Borrowers are auto-generated from Applications to keep V1 fast and reliable. Phase 2 can add borrower profiles + history.
        </div>
      </div>
    </div>
  );
}
