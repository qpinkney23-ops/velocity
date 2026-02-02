"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";

type AppDoc = {
  id: string;
  borrowerName?: string;
  email?: string;
  loanAmount?: number;
  status?: string;
  underwriterId?: string;
  updatedAt?: any;
  createdAt?: any;
};

function formatMoney(n?: number) {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return `$${v.toLocaleString()}`;
}

function bucket(status: string) {
  const s = (status || "").toLowerCase();
  if (s.includes("approve")) return "Approved";
  if (s.includes("condition")) return "Conditions";
  if (s.includes("uw") || s.includes("review")) return "UW Review";
  if (s.includes("new")) return "New";
  return "Other";
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
      {status || "—"}
    </span>
  );
}

export default function DashboardPage() {
  const [apps, setApps] = useState<AppDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "applications"), orderBy("updatedAt", "desc"), limit(80));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: AppDoc[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setApps(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  const kpis = useMemo(() => {
    const totalApps = apps.length;
    const totalVolume = apps.reduce((s, a) => s + (typeof a.loanAmount === "number" ? a.loanAmount : 0), 0);
    const missingEmail = apps.filter((a) => !(a.email || "").trim()).length;

    const by: Record<string, number> = { New: 0, "UW Review": 0, Conditions: 0, Approved: 0, Other: 0 };
    for (const a of apps) by[bucket(a.status || "")] = (by[bucket(a.status || "")] || 0) + 1;

    return { totalApps, totalVolume, missingEmail, by };
  }, [apps]);

  const stuck = useMemo(() => {
    // V1 heuristic: “stuck” = Conditions OR UW Review AND no underwriter assigned
    return apps
      .filter((a) => {
        const b = bucket(a.status || "");
        const needsUw = b === "UW Review" || b === "Conditions";
        return needsUw && !(a.underwriterId || "").trim();
      })
      .slice(0, 8);
  }, [apps]);

  const recent = useMemo(() => apps.slice(0, 10), [apps]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <div className="text-sm v-muted">Command center for pipeline, status, and underwriting.</div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link className="v-btn" href="/applications">
            View pipeline
          </Link>
          <Link className="v-btn-primary" href="/applications/new">
            New Application
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid md:grid-cols-3 gap-3">
        <div className="v-card p-5">
          <div className="text-xs v-muted">Applications</div>
          <div className="text-2xl font-semibold mt-1">{kpis.totalApps}</div>
          <div className="text-xs v-muted mt-2">
            New: <span className="font-semibold">{kpis.by["New"]}</span> • UW Review:{" "}
            <span className="font-semibold">{kpis.by["UW Review"]}</span> • Conditions:{" "}
            <span className="font-semibold">{kpis.by["Conditions"]}</span> • Approved:{" "}
            <span className="font-semibold">{kpis.by["Approved"]}</span>
          </div>
        </div>

        <div className="v-card p-5">
          <div className="text-xs v-muted">Pipeline volume</div>
          <div className="text-2xl font-semibold mt-1">{formatMoney(kpis.totalVolume)}</div>
          <div className="text-xs v-muted mt-2">Based on most recent records (demo-friendly).</div>
        </div>

        <div className="v-card p-5">
          <div className="text-xs v-muted">Data hygiene</div>
          <div className="text-2xl font-semibold mt-1">{kpis.missingEmail}</div>
          <div className="text-xs v-muted mt-2">Apps missing borrower email (older records).</div>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid lg:grid-cols-3 gap-3">
        {/* Stuck */}
        <div className="lg:col-span-1 v-card overflow-hidden">
          <div className="px-4 py-3 border-b bg-white flex items-center justify-between" style={{ borderColor: "var(--v-border)" }}>
            <div className="text-sm font-medium">Needs assignment</div>
            <div className="text-xs v-muted">{stuck.length} items</div>
          </div>

          {loading && <div className="p-4 text-sm v-muted">Loading…</div>}

          {!loading && stuck.length === 0 && (
            <div className="p-4 text-sm v-muted">Nothing urgent right now.</div>
          )}

          {!loading && stuck.length > 0 && (
            <div className="divide-y" style={{ borderColor: "var(--v-border)" }}>
              {stuck.map((a) => (
                <div key={a.id} className="p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{a.borrowerName || "Unknown borrower"}</div>
                    <div className="text-xs v-muted truncate">{a.email || `ID: ${a.id}`}</div>
                    <div className="mt-2 flex items-center gap-2">
                      <StatusChip status={a.status || "—"} />
                      <span className="text-xs v-muted">{formatMoney(a.loanAmount)}</span>
                    </div>
                  </div>
                  <Link className="v-btn" href={`/applications/${a.id}`}>
                    View
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="lg:col-span-2 v-card overflow-hidden">
          <div className="px-4 py-3 border-b bg-white flex items-center justify-between" style={{ borderColor: "var(--v-border)" }}>
            <div className="text-sm font-medium">Recent activity</div>
            <div className="text-xs v-muted">{recent.length} shown</div>
          </div>

          {loading && <div className="p-4 text-sm v-muted">Loading…</div>}

          {!loading && (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b" style={{ borderColor: "var(--v-border)" }}>
                  <tr>
                    <th className="text-left p-3">Applicant</th>
                    <th className="text-left p-3">Loan</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-right p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((a) => (
                    <tr key={a.id} className="border-b last:border-b-0" style={{ borderColor: "var(--v-border)" }}>
                      <td className="p-3">
                        <div className="font-medium">{a.borrowerName || "Unknown borrower"}</div>
                        <div className="text-xs v-muted">{a.email || `ID: ${a.id}`}</div>
                      </td>
                      <td className="p-3">{formatMoney(a.loanAmount)}</td>
                      <td className="p-3">
                        <StatusChip status={a.status || "—"} />
                      </td>
                      <td className="p-3 text-right">
                        <Link className="v-btn" href={`/applications/${a.id}`}>
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {recent.length === 0 && (
                    <tr>
                      <td className="p-8 text-sm v-muted" colSpan={4}>
                        No activity yet. Create an application to populate the dashboard.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Footer strip */}
      <div className="v-card p-4 flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm font-medium">Velocity V1 is operational.</div>
        <div className="text-xs v-muted">
          AI Scan is Phase 2 — keep the button visible, pipeline wired later.
        </div>
      </div>
    </div>
  );
}
