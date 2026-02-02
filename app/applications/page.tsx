"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/components/ui/ToastProvider";

type Underwriter = {
  id: string;
  name?: string;
  email?: string;
  active?: boolean;
};

type ScanExtracted = {
  borrower?: string;
  email?: string;
};

type AppRow = {
  id: string;
  borrowerName?: string;
  email?: string;
  loanAmount?: number;
  status?: string;
  underwriterId?: string;
  updatedAt?: any;
  createdAt?: any;
  scan?: { extracted?: ScanExtracted } | null;
};

function money(n?: number) {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return `$${Math.round(v).toLocaleString()}`;
}

function tsToMs(ts: any): number {
  if (!ts) return 0;
  const d = typeof ts?.toDate === "function" ? ts.toDate() : null;
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return 0;
  return d.getTime();
}

function initials(name: string, email: string) {
  const n = (name || "").trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    const a = (parts[0]?.[0] || "").toUpperCase();
    const b = (parts[1]?.[0] || "").toUpperCase();
    return (a + b) || a || "B";
  }
  const e = (email || "").trim();
  return (e.slice(0, 2) || "B").toUpperCase();
}

function statusTone(status: string) {
  const s = (status || "").toLowerCase();
  if (s.includes("approve")) return "green";
  if (s.includes("deny") || s.includes("decline")) return "red";
  if (s.includes("condition")) return "amber";
  if (s.includes("review") || s.includes("uw")) return "blue";
  if (s.includes("new")) return "gray";
  return "gray";
}

function StatusChip({ status }: { status: string }) {
  const tone = statusTone(status);
  const map: Record<string, { bg: string; border: string; text: string }> = {
    green: { bg: "bg-green-50", border: "border-green-200", text: "text-green-800" },
    red: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700" },
    amber: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800" },
    blue: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-800" },
    gray: { bg: "bg-gray-100", border: "border-gray-200", text: "text-gray-700" },
  };
  const c = map[tone] ?? map.gray;

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-md border text-xs ${c.bg} ${c.border} ${c.text}`}>
      {status || "New"}
    </span>
  );
}

function tabFromStatus(status: string) {
  const s = (status || "").toLowerCase();
  if (s.includes("new")) return "New";
  if (s.includes("review") || s.includes("uw")) return "UW Review";
  if (s.includes("condition")) return "Conditions";
  if (s.includes("approve")) return "Approved";
  if (s.includes("deny") || s.includes("decline")) return "Denied";
  return "All";
}

export default function ApplicationsPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [apps, setApps] = useState<AppRow[]>([]);
  const [underwriters, setUnderwriters] = useState<Underwriter[]>([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<"All" | "New" | "UW Review" | "Conditions" | "Approved" | "Denied">("All");
  const [search, setSearch] = useState("");

  // Applications live
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
      (err) => {
        setLoading(false);
        toast({ type: "error", title: "Failed to load applications", message: err?.message || "Unknown error" });
      }
    );
    return () => unsub();
  }, [toast]);

  // Underwriters live
  useEffect(() => {
    const q = query(collection(db, "underwriters"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: Underwriter[] = [];
        snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
        setUnderwriters(rows);
      },
      () => {}
    );
    return () => unsub();
  }, []);

  const uwMap = useMemo(() => {
    const m = new Map<string, Underwriter>();
    for (const u of underwriters) m.set(u.id, u);
    return m;
  }, [underwriters]);

  // ✅ THE FIX: never show “Unknown borrower / missing email” if scan extracted exists
  const normalized = useMemo(() => {
    return apps.map((a) => {
      const scanBorrower = (a.scan?.extracted?.borrower || "").toString().trim();
      const scanEmail = (a.scan?.extracted?.email || "").toString().trim();

      const borrowerName = (a.borrowerName || "").toString().trim() || scanBorrower || "Borrower";
      const email = (a.email || "").toString().trim() || scanEmail || "—";

      const updatedMs = Math.max(tsToMs(a.updatedAt), tsToMs(a.createdAt));

      const uw = a.underwriterId ? uwMap.get(a.underwriterId) : null;
      const uwName = uw?.name || uw?.email || (a.underwriterId ? "Assigned" : "Unassigned");
      const uwEmail = uw?.email || "";

      return {
        ...a,
        borrowerName,
        email,
        updatedMs,
        uwName,
        uwEmail,
      };
    });
  }, [apps, uwMap]);

  const counts = useMemo(() => {
    const c = { All: 0, New: 0, "UW Review": 0, Conditions: 0, Approved: 0, Denied: 0 } as Record<string, number>;
    for (const a of normalized) {
      c.All += 1;
      const t = tabFromStatus(a.status || "New");
      if (c[t] !== undefined) c[t] += 1;
    }
    return c;
  }, [normalized]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    let list = normalized;

    if (tab !== "All") {
      list = list.filter((a) => tabFromStatus(a.status || "New") === tab);
    }

    if (!q) return list;

    return list.filter((a) => {
      const uw = a.uwName || "";
      return (
        (a.borrowerName || "").toLowerCase().includes(q) ||
        (a.email || "").toLowerCase().includes(q) ||
        (a.status || "").toLowerCase().includes(q) ||
        uw.toLowerCase().includes(q)
      );
    });
  }, [normalized, tab, search]);

  const totalVolume = useMemo(() => {
    return normalized.reduce((acc, a: any) => acc + (typeof a.loanAmount === "number" ? a.loanAmount : 0), 0);
  }, [normalized]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Applications</h1>
          <div className="text-sm v-muted">Manage your pipeline at a glance.</div>
        </div>

        <button className="v-btn-primary" onClick={() => router.push("/applications/new")}>
          New Application
        </button>
      </div>

      <div className="v-card p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[240px]">
            <input
              className="w-full border rounded-xl p-2 bg-white text-sm"
              style={{ borderColor: "rgba(15,23,42,0.10)" }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search loans, borrowers…"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {(["All", "New", "UW Review", "Conditions", "Approved", "Denied"] as const).map((t) => (
              <button
                key={t}
                className="v-btn"
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? "rgba(31,111,235,0.10)" : undefined,
                  borderColor: tab === t ? "rgba(31,111,235,0.25)" : undefined,
                }}
              >
                {t} <span className="v-chip ml-2">{counts[t]}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="v-chip">{filtered.length} shown</span>
            <span className="v-chip">{money(totalVolume)} volume</span>
          </div>
        </div>
      </div>

      <div className="v-card overflow-hidden">
        <div className="p-4 border-b bg-white flex items-center justify-between" style={{ borderColor: "var(--v-border)" }}>
          <div className="text-sm font-medium">Pipeline</div>
          <div className="text-xs v-muted">{loading ? "Loading…" : "Live"}</div>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b" style={{ borderColor: "var(--v-border)" }}>
              <tr>
                <th className="text-left p-3">Applicant</th>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">Amount</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Assigned Underwriter</th>
                <th className="text-right p-3">Action</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((a: any) => (
                <tr key={a.id} className="border-b last:border-b-0" style={{ borderColor: "var(--v-border)" }}>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full border flex items-center justify-center text-xs font-semibold"
                        style={{
                          borderColor: "rgba(15,23,42,0.12)",
                          background: "rgba(31,111,235,0.10)",
                          color: "rgba(15,23,42,0.85)",
                        }}
                        title={a.borrowerName}
                      >
                        {initials(a.borrowerName, a.email)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{a.borrowerName}</div>
                        <div className="text-xs v-muted truncate">{`ID: ${a.id}`}</div>
                      </div>
                    </div>
                  </td>

                  <td className="p-3">{a.email}</td>

                  <td className="p-3">{money(a.loanAmount)}</td>

                  <td className="p-3">
                    <StatusChip status={(a.status || "New").toString()} />
                  </td>

                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full border flex items-center justify-center text-[11px] font-semibold"
                        style={{
                          borderColor: "rgba(15,23,42,0.12)",
                          background: (a.underwriterId ? "rgba(16,185,129,0.10)" : "rgba(148,163,184,0.12)"),
                          color: "rgba(15,23,42,0.80)",
                        }}
                        title={a.uwName}
                      >
                        {initials(a.uwName || "UW", a.uwEmail || "")}
                      </div>

                      <div className="min-w-0">
                        <div className="font-medium truncate">{a.uwName}</div>
                        <div className="text-xs v-muted truncate">{a.uwEmail || (a.underwriterId ? "assigned" : "unassigned")}</div>
                      </div>
                    </div>
                  </td>

                  <td className="p-3 text-right">
                    <button className="v-btn" onClick={() => router.push(`/applications/${a.id}`)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td className="p-8 text-sm v-muted" colSpan={6}>
                    No applications match your search.
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td className="p-8 text-sm v-muted" colSpan={6}>
                    Loading applications…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="v-card p-4">
        <div className="text-sm font-medium">Data quality</div>
        <div className="text-xs v-muted mt-1">
          Applicant + Email now auto-fill from AI Scan snapshot when older records are missing fields. Next we can add a one-click “Backfill” tool in Admin if you want the database cleaned permanently.
        </div>
      </div>
    </div>
  );
}
