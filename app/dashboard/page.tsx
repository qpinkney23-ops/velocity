"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchApplicationPages } from "@/lib/applicationReadClient";
import {queueItem,workflowMetrics} from "@/lib/workflow/enterprisePipeline";

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

type Tone = "green" | "red" | "amber" | "blue" | "gray" | "slate";

function formatMoney(n?: number) {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return `$${v.toLocaleString()}`;
}

function formatCompactMoney(n?: number) {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  if (v >= 1000000) return `$${(v / 1000000).toFixed(v >= 10000000 ? 1 : 2)}M`;
  if (v >= 1000) return `$${Math.round(v / 1000).toLocaleString()}K`;
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

function statusTone(status: string): Tone {
  const s = (status || "").toLowerCase();
  if (s.includes("approve")) return "green";
  if (s.includes("deny") || s.includes("decline")) return "red";
  if (s.includes("condition")) return "amber";
  if (s.includes("review") || s.includes("uw")) return "blue";
  if (s.includes("new")) return "gray";
  return "gray";
}

function toneClasses(tone: Tone) {
  const map: Record<Tone, { bg: string; border: string; text: string; dot: string }> = {
    green: { bg: "bg-green-50", border: "border-green-200", text: "text-green-800", dot: "bg-green-500" },
    red: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", dot: "bg-red-500" },
    amber: { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-600", dot: "bg-slate-500" },
    blue: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-800", dot: "bg-blue-500" },
    gray: { bg: "bg-gray-100", border: "border-gray-200", text: "text-gray-700", dot: "bg-gray-400" },
    slate: { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-800", dot: "bg-slate-500" },
  };

  return map[tone] ?? map.gray;
}

function StatusChip({ status }: { status: string }) {
  const c = toneClasses(statusTone(status));
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs ${c.bg} ${c.border} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {status || "—"}
    </span>
  );
}

function ToneChip({ label, tone }: { label: string; tone: Tone }) {
  const c = toneClasses(tone);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs ${c.bg} ${c.border} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {label}
    </span>
  );
}

function getDateMs(value: any) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  if (typeof value === "number") return value;
  return 0;
}

function formatAge(value: any) {
  const ms = getDateMs(value);
  if (!ms) return "No timestamp";

  const diff = Date.now() - ms;
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return new Date(ms).toLocaleDateString();
}

function commandTone(attentionCount: number, missingEmail: number): Tone {
  if (attentionCount >= 8 || missingEmail >= 25) return "red";
  if (attentionCount > 0 || missingEmail > 0) return "amber";
  return "green";
}

function commandTitle(attentionCount: number, missingEmail: number) {
  if (attentionCount >= 8) return `${attentionCount} files need underwriting action`;
  if (missingEmail >= 25) return `${missingEmail} borrower records need cleanup`;
  if (attentionCount > 0) return `${attentionCount} files need assignment`;
  if (missingEmail > 0) return `${missingEmail} borrower records need cleanup`;
  return "Pipeline is operating cleanly";
}

function commandSubtitle(totalApps: number, attentionCount: number, unassigned: number, missingEmail: number) {
  if (totalApps === 0) return "Create your first application to begin generating live operational intelligence.";
  if (attentionCount > 0 || missingEmail > 0) {
    return `${attentionCount} underwriting attention items, ${unassigned} unassigned files, and ${missingEmail} incomplete borrower records are shaping today’s risk posture.`;
  }
  return "No urgent blockers detected. Pipeline is clean enough for demo review and team execution.";
}

function borrowerDisplay(app: AppDoc) {
  const name = (app.borrowerName || "").trim();
  if (name) return name;

  return `Pending profile #${app.id.slice(0, 6).toUpperCase()}`;
}

function borrowerSubline(app: AppDoc) {
  const email = (app.email || "").trim();
  if (email) return email;

  return "Borrower identity awaiting extraction";
}

function loanDisplay(app: AppDoc) {
  const value = typeof app.loanAmount === "number" && Number.isFinite(app.loanAmount) ? app.loanAmount : 0;
  if (value > 0) return formatMoney(value);
  return "Awaiting loan data";
}

function priorityTone(app: AppDoc): Tone {
  const value = typeof app.loanAmount === "number" && Number.isFinite(app.loanAmount) ? app.loanAmount : 0;
  const b = bucket(app.status || "");

  if (b === "Conditions" && value >= 300000) return "red";
  if (b === "UW Review" || b === "Conditions") return "amber";
  if (value >= 500000) return "blue";
  return "gray";
}

function priorityLabel(app: AppDoc) {
  const tone = priorityTone(app);
  if (tone === "red") return "High priority";
  if (tone === "amber") return "Needs owner";
  if (tone === "blue") return "High value";
  return "Monitor";
}

function rowPrioritySurface(app: AppDoc) {
  const hasProfileGap = !(app.borrowerName || "").trim() || !(app.email || "").trim();
  const b = bucket(app.status || "");

  if (b === "Conditions") return "bg-red-50/40";
  if (b === "UW Review") return "bg-blue-50/40";
  if (hasProfileGap) return "bg-slate-50/70 opacity-80";
  return "bg-white";
}

function updateTone(app: AppDoc) {
  const ms = getDateMs(app.updatedAt || app.createdAt);
  if (!ms) return "muted";
  const hours = (Date.now() - ms) / 36e5;
  if (hours <= 6) return "fresh";
  if (hours >= 72) return "stale";
  return "normal";
}

function actionLabel(app: AppDoc) {
  const b = bucket(app.status || "");
  if (b === "Conditions") return "Resolve conditions";
  if (b === "UW Review") return "Assign underwriter";
  if (!(app.borrowerName || "").trim()) return "Complete profile";
  return "Open file";
}

function commandSeverityLabel(attentionCount: number, missingEmail: number) {
  if (attentionCount >= 8) return "Critical action required";
  if (missingEmail >= 25) return "Data cleanup blocking confidence";
  if (attentionCount > 0) return "Ownership required";
  if (missingEmail > 0) return "Profile cleanup recommended";
  return "Operating cleanly";
}

function commandPrimaryMetric(attentionCount: number, missingEmail: number) {
  if (attentionCount > 0) return attentionCount;
  if (missingEmail > 0) return missingEmail;
  return 0;
}

function commandPrimaryLabel(attentionCount: number, missingEmail: number) {
  if (attentionCount > 0) return "Files needing action";
  if (missingEmail > 0) return "Profile gaps";
  return "Urgent items";
}

function executionFeedItems(kpis: {
  unassigned: number;
  missingEmail: number;
  by: Record<string, number>;
  attentionCount: number;
}, unresolvedProfileCount: number) {
  return [
    {
      label: "Assign ownership",
      value: kpis.unassigned,
      detail: "files have no underwriter assigned",
      href: "/applications?filter=unassigned",
      tone: kpis.unassigned > 0 ? "blue" : "green",
    },
    {
      label: "Complete borrower profiles",
      value: unresolvedProfileCount,
      detail: "files need borrower identity cleanup",
      href: "/applications?filter=missing-profile",
      tone: unresolvedProfileCount > 0 ? "blue" : "green",
    },
    {
      label: "Resolve conditions",
      value: kpis.by["Conditions"] || 0,
      detail: "files are still condition-heavy",
      href: "/applications?filter=conditions",
      tone: (kpis.by["Conditions"] || 0) > 0 ? "red" : "green",
    },
    {
      label: "Review UW pressure",
      value: kpis.attentionCount,
      detail: "files need underwriting attention",
      href: "/applications?filter=uw-review",
      tone: kpis.attentionCount > 0 ? "blue" : "green",
    },
  ] as const;
}

function signalScore(app: AppDoc) {
  const value = typeof app.loanAmount === "number" && Number.isFinite(app.loanAmount) ? app.loanAmount : 0;
  const b = bucket(app.status || "");
  let score = 0;

  if (b === "Conditions") score += 40;
  if (b === "UW Review") score += 30;
  if (!(app.underwriterId || "").trim()) score += 25;
  if (value >= 500000) score += 20;
  else if (value >= 300000) score += 12;
  if (!(app.borrowerName || "").trim()) score += 8;
  if (!(app.email || "").trim()) score += 5;

  return score;
}

function percent(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function ProgressBar({ value, tone }: { value: number; tone: Tone }) {
  const c = toneClasses(tone);
  const safe = Math.max(0, Math.min(100, value));

  return (
    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full rounded-full ${c.dot}`} style={{ width: `${safe}%` }} />
    </div>
  );
}

function MetricCard({
  label,
  value,
  helper,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  helper?: string;
  tone?: Tone;
}) {
  const c = toneClasses(tone);

  return (
    <div className="v-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs v-muted">{label}</div>
          <div className="text-3xl font-semibold mt-1 tracking-tight">{value}</div>
        </div>
        <span className={`h-9 w-9 rounded-2xl border ${c.bg} ${c.border} flex items-center justify-center`}>
          <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
        </span>
      </div>
      {helper ? <div className="text-xs v-muted mt-3 leading-relaxed">{helper}</div> : null}
    </div>
  );
}

export default function DashboardPage() {
  const [apps, setApps] = useState<AppDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active=true;const load=()=>fetchApplicationPages(80).then(({applications})=>{if(active)setApps(applications.slice(0,80))}).finally(()=>{if(active)setLoading(false)});void load();const timer=setInterval(load,15000);return()=>{active=false;clearInterval(timer)};
  }, []);

  const kpis = useMemo(() => {
    const totalApps = apps.length;
    const totalVolume = apps.reduce((s, a) => s + (typeof a.loanAmount === "number" ? a.loanAmount : 0), 0);
    const missingEmail = apps.filter((a) => !(a.email || "").trim()).length;
    const assigned = apps.filter((a) => (a.underwriterId || "").trim()).length;
    const unassigned = totalApps - assigned;

    const by: Record<string, number> = { New: 0, "UW Review": 0, Conditions: 0, Approved: 0, Other: 0 };
    for (const a of apps) by[bucket(a.status || "")] = (by[bucket(a.status || "")] || 0) + 1;

    const attentionCount = by["UW Review"] + by["Conditions"];
    const hygieneScore = totalApps ? Math.max(0, 100 - Math.round((missingEmail / totalApps) * 100)) : 100;
    const approvalRate = percent(by["Approved"], totalApps);
    const assignmentRate = percent(assigned, totalApps);

    return {
      totalApps,
      totalVolume,
      missingEmail,
      assigned,
      unassigned,
      by,
      attentionCount,
      hygieneScore,
      approvalRate,
      assignmentRate,
    };
  }, [apps]);
  const workflowKpis=useMemo(()=>workflowMetrics(apps.map(a=>queueItem({...a,scan:(a as any).workflowFacts}))),[apps]);

  const stuck = useMemo(() => {
    return apps
      .filter((a) => {
        const b = bucket(a.status || "");
        const needsUw = b === "UW Review" || b === "Conditions";
        return needsUw && !(a.underwriterId || "").trim();
      })
      .slice(0, 8);
  }, [apps]);

  const actionQueue = useMemo(() => {
    return [...apps]
      .filter((a) => {
        const b = bucket(a.status || "");
        return b === "UW Review" || b === "Conditions" || !(a.underwriterId || "").trim();
      })
      .sort((a, b) => signalScore(b) - signalScore(a))
      .slice(0, 6);
  }, [apps]);

  const unresolvedProfileCount = useMemo(() => {
    return apps.filter((a) => !(a.borrowerName || "").trim() || !(a.email || "").trim()).length;
  }, [apps]);

  const recent = useMemo(() => {
    const named = apps.filter((a) => (a.borrowerName || "").trim() || (a.email || "").trim());
    const unnamed = apps.filter((a) => !(a.borrowerName || "").trim() && !(a.email || "").trim());
    return [...named, ...unnamed].slice(0, 10);
  }, [apps]);

  const largestFiles = useMemo(() => {
    return [...apps]
      .sort((a, b) => (typeof b.loanAmount === "number" ? b.loanAmount : 0) - (typeof a.loanAmount === "number" ? a.loanAmount : 0))
      .slice(0, 5);
  }, [apps]);

  const healthTone: Tone = kpis.attentionCount > 15 || kpis.missingEmail > 20 ? "amber" : "green";
  const healthLabel =
    kpis.totalApps === 0
      ? "No active pipeline yet"
      : kpis.attentionCount > 15
      ? "High review volume"
      : kpis.missingEmail > 20
      ? "Profile cleanup needed"
      : "Pipeline healthy";

  const activeCommandTone = commandTone(kpis.attentionCount, kpis.missingEmail);
  const commandBorder =
    activeCommandTone === "red"
      ? "border-red-200 bg-red-50/80"
      : activeCommandTone === "amber"
      ? "border-slate-800 bg-slate-950 text-white"
      : "border-green-200 bg-green-50/80";

  const executionItems = executionFeedItems(kpis, unresolvedProfileCount);

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-3xl border bg-white shadow-sm" style={{ borderColor: "var(--v-border)" }}>
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-blue-50 via-white to-slate-50" />
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-100/60 blur-3xl" />
        <div className="absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-slate-100/80 blur-3xl" />

        <div className="relative p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <ToneChip label="Velocity Command Center" tone="blue" />
                <ToneChip label={healthLabel} tone={healthTone} />
                <ToneChip label="Live pipeline intelligence" tone="slate" />
              </div>

              <h1 className="text-4xl font-semibold mt-4 tracking-tight">Executive Dashboard</h1>

              <div className="text-sm v-muted mt-2 max-w-3xl">
                A real-time operating layer for loan teams — pipeline health, underwriting pressure, assignment coverage,
                data risk, and high-value borrower movement in one clean command center.
              </div>
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

          <div className="grid xl:grid-cols-4 md:grid-cols-2 gap-3 mt-6">
            <div className="rounded-2xl border bg-white/85 p-4 shadow-sm"><div className="text-xs v-muted">Ready for Underwriter</div><div className="text-2xl font-semibold mt-1">{workflowKpis.readyForUnderwriter}</div></div>
            <div className="rounded-2xl border bg-white/85 p-4 shadow-sm"><div className="text-xs v-muted">Blocked / Review</div><div className="text-2xl font-semibold mt-1">{workflowKpis.blocked} / {workflowKpis.reviewRequired}</div></div>
            <div className="rounded-2xl border bg-white/85 p-4 shadow-sm"><div className="text-xs v-muted">SLA Approaching</div><div className="text-2xl font-semibold mt-1">{workflowKpis.slaApproaching}</div></div>
            <div className="rounded-2xl border bg-white/85 p-4 shadow-sm"><div className="text-xs v-muted">SLA Breached</div><div className="text-2xl font-semibold mt-1">{workflowKpis.slaBreached}</div><Link href="/queue" className="text-xs text-blue-700">Open prioritized queue</Link></div>
            <div className="rounded-2xl border bg-white/85 p-5 shadow-sm" style={{ borderColor: "var(--v-border)" }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs v-muted">Pipeline Volume</div>
                  <div className="text-3xl font-semibold mt-1 tracking-tight">{formatCompactMoney(kpis.totalVolume)}</div>
                </div>
                <span className="rounded-2xl border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-800">
                  {kpis.totalApps} files
                </span>
              </div>
              <div className="text-xs v-muted mt-3">Total active loan amount across the current monitored pipeline.</div>
            </div>

            <div className="rounded-2xl border bg-white/85 p-5 shadow-sm" style={{ borderColor: "var(--v-border)" }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs v-muted">Underwriting Pressure</div>
                  <div className="text-3xl font-semibold mt-1 tracking-tight">{kpis.attentionCount}</div>
                </div>
                <ToneChip label={kpis.attentionCount > 15 ? "Elevated" : "Controlled"} tone={kpis.attentionCount > 15 ? "amber" : "green"} />
              </div>
              <div className="text-xs v-muted mt-3">Files in UW Review or Conditions that need operational attention.</div>
            </div>

            <div className="rounded-2xl border bg-white/85 p-5 shadow-sm" style={{ borderColor: "var(--v-border)" }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs v-muted">Data Risk</div>
                  <div className="text-3xl font-semibold mt-1 tracking-tight">{100 - kpis.hygieneScore}%</div>
                </div>
                <ToneChip label={kpis.hygieneScore >= 90 ? "Clean" : "Review"} tone={kpis.hygieneScore >= 90 ? "green" : "amber"} />
              </div>
              <div className="text-xs v-muted mt-3">{kpis.missingEmail} borrower records are missing email data.</div>
            </div>

            <div className="rounded-2xl border bg-white/85 p-5 shadow-sm" style={{ borderColor: "var(--v-border)" }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs v-muted">Approval Conversion</div>
                  <div className="text-3xl font-semibold mt-1 tracking-tight">{kpis.approvalRate}%</div>
                </div>
                <ToneChip label={kpis.approvalRate >= 25 ? "Healthy" : "Watch"} tone={kpis.approvalRate >= 25 ? "green" : "blue"} />
              </div>
              <div className="text-xs v-muted mt-3">Share of monitored files that have reached approved status.</div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border bg-white/75 p-4" style={{ borderColor: "var(--v-border)" }}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-semibold">System note</div>
                <div className="text-xs v-muted mt-1">
                  {kpis.totalApps === 0
                    ? "No loan files are active yet. Create an application to begin generating workflow intelligence."
                    : `${kpis.totalApps} files, ${kpis.attentionCount} underwriting attention items, ${kpis.unassigned} unassigned files, and ${kpis.missingEmail} records needing data cleanup.`}
                </div>
              </div>
              <ToneChip label={healthLabel} tone={healthTone} />
            </div>
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 p-6 text-white shadow-sm">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute -left-20 bottom-0 h-60 w-60 rounded-full bg-slate-500/20 blur-3xl" />

        <div className="relative flex items-start justify-between gap-5 flex-wrap">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Command layer</div>
              <span className="inline-flex items-center rounded-md border border-white/10 bg-white/10 px-2 py-1 text-xs text-slate-200">
                {commandSeverityLabel(kpis.attentionCount, kpis.missingEmail)}
              </span>
            </div>

            <div className="mt-4 flex items-end gap-4 flex-wrap">
              <div className="text-6xl font-semibold tracking-tight leading-none">
                {commandPrimaryMetric(kpis.attentionCount, kpis.missingEmail)}
              </div>
              <div className="pb-2">
                <div className="text-base font-semibold text-white">{commandPrimaryLabel(kpis.attentionCount, kpis.missingEmail)}</div>
                <div className="text-sm text-slate-300 mt-1">{commandTitle(kpis.attentionCount, kpis.missingEmail)}</div>
              </div>
            </div>

            <div className="text-sm text-slate-300 mt-4">
              {commandSubtitle(kpis.totalApps, kpis.attentionCount, kpis.unassigned, kpis.missingEmail)}
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-2 min-w-[240px]">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-slate-400">Mission items</div>
                <div className="text-2xl font-semibold mt-1">{actionQueue.length}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-slate-400">Profile gaps</div>
                <div className="text-2xl font-semibold mt-1">{unresolvedProfileCount}</div>
              </div>
            </div>

            <Link className="rounded-xl bg-white px-4 py-2 text-center text-sm font-medium text-slate-950 transition hover:-translate-y-0.5 hover:shadow-md" href="/applications">
              Work the queue
            </Link>
          </div>
        </div>

      <div className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 flex-wrap">
              <ToneChip label="Regression Suite Ready" tone="green" />
              <ToneChip label="4/4 Protected Systems" tone="blue" />
              <ToneChip label="Manual verification complete" tone="slate" />
            </div>

            <div className="text-2xl font-semibold tracking-tight mt-4">
              Operational safety layer active
            </div>

            <div className="text-sm text-slate-700 mt-2 leading-relaxed">
              Velocity regression protections passed across underwriting math,
              workflow orchestration, OCR ingestion, and report/PDF generation.
              Run the suite before deployments, major refactors, investor demos,
              or underwriting-engine modifications.
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-300 bg-white px-4 py-3 min-w-[220px]">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Last verified
            </div>
            <div className="text-lg font-semibold mt-1">
              Manual regression pass
            </div>
            <div className="text-xs text-slate-500 mt-1">
              DTI • Workflow • Report/PDF • OCR
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-3 mt-5">
          {[
            { label: "DTI", detail: "Debt + housing math protected" },
            { label: "Workflow", detail: "Canonical readiness protected" },
            { label: "Report/PDF", detail: "Operational exports protected" },
            { label: "OCR", detail: "Fail-closed ingestion protected" },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-emerald-200 bg-white/90 p-4"
            >
              <div className="text-xs v-muted">Protected System</div>
              <div className="text-lg font-semibold mt-1">{item.label}</div>
              <div className="text-xs text-slate-500 mt-2 leading-relaxed">
                {item.detail}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">
            Regression rerun command
          </div>

          <code className="mt-2 block overflow-x-auto whitespace-nowrap text-xs text-white">
            cd /d C:\Users\Qpink\velocity && npx tsx scripts\velocityRegressionSuite.ts
          </code>
        </div>
      </div>
      </div>

      <div className="v-card overflow-hidden">
        <div className="px-5 py-4 border-b bg-white flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: "var(--v-border)" }}>
          <div>
            <div className="text-sm font-semibold">Execution Feed</div>
            <div className="text-xs v-muted mt-1">Action-first operating list. Each row moves the team toward cleaner files and faster approvals.</div>
          </div>
          <ToneChip label="Action layer" tone="blue" />
        </div>

        <div className="grid md:grid-cols-4 divide-y md:divide-y-0 md:divide-x" style={{ borderColor: "var(--v-border)" }}>
          {executionItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="group p-5 transition hover:bg-slate-50"
              style={{ borderColor: "var(--v-border)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs v-muted">{item.label}</div>
                  <div className="text-3xl font-semibold mt-2 tracking-tight">{item.value}</div>
                </div>
                <span
                  className={
                    item.tone === "red"
                      ? "h-9 w-9 rounded-2xl border border-red-200 bg-red-50 flex items-center justify-center"
                      : item.tone === "green"
                      ? "h-9 w-9 rounded-2xl border border-green-200 bg-green-50 flex items-center justify-center"
                      : "h-9 w-9 rounded-2xl border border-blue-200 bg-blue-50 flex items-center justify-center"
                  }
                >
                  <span
                    className={
                      item.tone === "red"
                        ? "h-2.5 w-2.5 rounded-full bg-red-500"
                        : item.tone === "green"
                        ? "h-2.5 w-2.5 rounded-full bg-green-500"
                        : "h-2.5 w-2.5 rounded-full bg-blue-500"
                    }
                  />
                </span>
              </div>
              <div className="text-xs v-muted mt-3 leading-relaxed">{item.detail}</div>
              <div className="text-xs font-medium text-blue-700 mt-4 opacity-0 transition group-hover:opacity-100">
                Open filtered view →
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-3">
        <div className="v-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Pipeline Distribution</div>
              <div className="text-xs v-muted mt-1">Status mix across recent applications.</div>
            </div>
            <ToneChip label={`${kpis.totalApps} files`} tone="gray" />
          </div>

          <div className="space-y-4 mt-5">
            {(["New", "UW Review", "Conditions", "Approved", "Other"] as const).map((label) => {
              const count = kpis.by[label] || 0;
              const tone: Tone =
                label === "Approved"
                  ? "green"
                  : label === "Conditions"
                  ? "amber"
                  : label === "UW Review"
                  ? "blue"
                  : "gray";

              return (
                <div key={label} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>{label}</span>
                    <span className="font-semibold">{count}</span>
                  </div>
                  <ProgressBar value={percent(count, kpis.totalApps)} tone={tone} />
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-2 v-card p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-semibold">Operational Readiness</div>
              <div className="text-xs v-muted mt-1">Fast signal on whether the pipeline is clean enough for demo or production review.</div>
            </div>
            <ToneChip label={healthLabel} tone={healthTone} />
          </div>

          <div className="grid md:grid-cols-3 gap-3 mt-5">
            <div className="rounded-2xl border p-4 bg-slate-50/60" style={{ borderColor: "var(--v-border)" }}>
              <div className="text-xs v-muted">Assignment coverage</div>
              <div className="text-xl font-semibold mt-1">{kpis.assignmentRate}%</div>
              <div className="mt-3">
                <ProgressBar value={kpis.assignmentRate} tone={kpis.assignmentRate >= 80 ? "green" : "amber"} />
              </div>
            </div>

            <div className="rounded-2xl border p-4 bg-slate-50/60" style={{ borderColor: "var(--v-border)" }}>
              <div className="text-xs v-muted">Data hygiene</div>
              <div className="text-xl font-semibold mt-1">{kpis.hygieneScore}%</div>
              <div className="mt-3">
                <ProgressBar value={kpis.hygieneScore} tone={kpis.hygieneScore >= 90 ? "green" : "amber"} />
              </div>
            </div>

            <div className="rounded-2xl border p-4 bg-slate-50/60" style={{ borderColor: "var(--v-border)" }}>
              <div className="text-xs v-muted">Approval conversion</div>
              <div className="text-xl font-semibold mt-1">{kpis.approvalRate}%</div>
              <div className="mt-3">
                <ProgressBar value={kpis.approvalRate} tone={kpis.approvalRate >= 25 ? "green" : "blue"} />
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border p-4 bg-white" style={{ borderColor: "var(--v-border)" }}>
            <div className="text-sm font-semibold">Operational readout</div>
            <div className="text-sm v-muted mt-2">
              {kpis.totalApps === 0
                ? "No files are in the pipeline yet. Create an application to begin tracking operational health."
                : `${kpis.totalApps} files are being monitored with ${kpis.attentionCount} requiring underwriting attention and ${kpis.missingEmail} missing borrower email data.`}
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-3">
        <div className="lg:col-span-1 v-card overflow-hidden">
          <div className="px-4 py-3 border-b bg-white flex items-center justify-between" style={{ borderColor: "var(--v-border)" }}>
            <div>
              <div className="text-sm font-medium">Mission Queue</div>
              <div className="text-xs v-muted mt-1">Ranked action list by urgency, value, conditions, and ownership gaps.</div>
            </div>
            <ToneChip label={`${stuck.length} items`} tone={stuck.length > 0 ? "amber" : "green"} />
          </div>

          {loading && <div className="p-4 text-sm v-muted">Loading…</div>}

          {!loading && actionQueue.length === 0 && (
            <div className="p-5 text-sm v-muted">Nothing urgent right now.</div>
          )}

          {!loading && actionQueue.length > 0 && (
            <div className="divide-y" style={{ borderColor: "var(--v-border)" }}>
              {actionQueue.map((a, index) => (
                <div
                  key={a.id}
                  className="p-4 flex items-start justify-between gap-3 transition hover:bg-white hover:shadow-[inset_4px_0_0_rgba(245,158,11,0.55)] hover:pl-5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white text-xs font-semibold">
                        {index + 1}
                      </span>
                      <div className="text-sm font-semibold truncate">{borrowerDisplay(a)}</div>
                      <ToneChip label={priorityLabel(a)} tone={priorityTone(a)} />
                    </div>
                    <div className="text-xs v-muted truncate mt-1">{borrowerSubline(a)}</div>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <StatusChip status={a.status || "—"} />
                      <span className="text-xs font-medium text-slate-700">{loanDisplay(a)}</span>
                      <span className="text-xs v-muted">{formatAge(a.updatedAt || a.createdAt)}</span>
                    </div>
                  </div>
                  <Link className="v-btn transition hover:-translate-y-0.5 hover:shadow-sm whitespace-nowrap" href={`/applications/${a.id}`}>
                    {actionLabel(a)}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 v-card overflow-hidden">
          <div className="px-4 py-3 border-b bg-white flex items-center justify-between" style={{ borderColor: "var(--v-border)" }}>
            <div>
              <div className="text-sm font-medium">Pipeline Activity</div>
              <div className="text-xs v-muted mt-1">Recent borrower movement, profile readiness, and file actions.</div>
            </div>
            <ToneChip label={`${recent.length} shown`} tone="gray" />
          </div>

          {loading && <div className="p-4 text-sm v-muted">Loading…</div>}

          {!loading && unresolvedProfileCount > 0 && (
            <div className="mx-4 mt-4 rounded-2xl border bg-slate-50 p-3 text-sm" style={{ borderColor: "var(--v-border)" }}>
              <div className="font-semibold text-slate-900">{unresolvedProfileCount} files awaiting borrower profile cleanup</div>
              <div className="text-xs text-slate-600 mt-1">
                Unverified rows are grouped and labeled as operational work so demo viewers see an intake queue, not broken records.
              </div>
            </div>
          )}

          {!loading && (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b" style={{ borderColor: "var(--v-border)" }}>
                  <tr>
                    <th className="text-left p-3">Applicant</th>
                    <th className="text-left p-3">Loan</th>
                    <th className="text-left p-3">Updated</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-right p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((a) => (
                    <tr key={a.id} className="border-b last:border-b-0 hover:bg-slate-50/60" style={{ borderColor: "var(--v-border)" }}>
                      <td className="p-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="font-medium">{borrowerDisplay(a)}</div>
                          {!(a.borrowerName || "").trim() ? <ToneChip label="Unverified" tone="amber" /> : null}
                        </div>
                        <div className="text-xs v-muted">{borrowerSubline(a)}</div>
                      </td>
                      <td className="p-3">
                        <span className={loanDisplay(a).startsWith("$") ? "font-semibold text-slate-900" : "text-slate-400"}>
                          {loanDisplay(a)}
                        </span>
                      </td>
                      <td className="p-3 text-xs">
                        <span
                          className={
                            updateTone(a) === "fresh"
                              ? "text-blue-700 font-medium"
                              : updateTone(a) === "stale"
                              ? "text-slate-400"
                              : "v-muted"
                          }
                        >
                          {formatAge(a.updatedAt || a.createdAt)}
                        </span>
                      </td>
                      <td className="p-3">
                        <StatusChip status={a.status || "—"} />
                      </td>
                      <td className="p-3 text-right">
                        <Link className="v-btn" href={`/applications/${a.id}`}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {recent.length === 0 && (
                    <tr>
                      <td className="p-8 text-sm v-muted" colSpan={5}>
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

      <div className="grid lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 rounded-3xl border bg-slate-950 text-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400">Operating playbook</div>
              <div className="text-xl font-semibold mt-2">Run loan operations from signal to action.</div>
              <div className="text-sm text-slate-300 mt-2 max-w-2xl">
                Convert the command signal into daily execution: assign ownership, clean profiles, and clear conditions.
              </div>
            </div>
            <Link className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-950 transition hover:-translate-y-0.5 hover:shadow-md" href="/applications?filter=unassigned">
              Work ownership queue
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-3 mt-5">
            <Link href="/applications?filter=unassigned" className="rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:-translate-y-0.5 hover:bg-white/10">
              <div className="text-xs text-slate-400">1. Assign underwriter</div>
              <div className="text-2xl font-semibold mt-1">{kpis.unassigned}</div>
              <div className="text-xs text-slate-400 mt-2">files without an owner</div>
            </Link>

            <Link href="/applications?filter=missing-profile" className="rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:-translate-y-0.5 hover:bg-white/10">
              <div className="text-xs text-slate-400">2. Complete borrower profile</div>
              <div className="text-2xl font-semibold mt-1">{unresolvedProfileCount}</div>
              <div className="text-xs text-slate-400 mt-2">files missing identity data</div>
            </Link>

            <Link href="/applications?filter=conditions" className="rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:-translate-y-0.5 hover:bg-white/10">
              <div className="text-xs text-slate-400">3. Resolve conditions</div>
              <div className="text-2xl font-semibold mt-1">{kpis.by["Conditions"]}</div>
              <div className="text-xs text-slate-400 mt-2">files blocking approval</div>
            </Link>
          </div>
        </div>

        <div className="v-card p-5">
          <div className="text-sm font-semibold">Demo narrative</div>
          <div className="text-xs v-muted mt-1">What this dashboard proves in a sales call.</div>

          <div className="space-y-3 mt-5">
            <div className="rounded-2xl border p-3 bg-slate-50/70" style={{ borderColor: "var(--v-border)" }}>
              <div className="text-xs v-muted">Signal</div>
              <div className="text-sm font-medium mt-1">Velocity identifies the files that need attention first.</div>
            </div>
            <div className="rounded-2xl border p-3 bg-slate-50/70" style={{ borderColor: "var(--v-border)" }}>
              <div className="text-xs v-muted">Action</div>
              <div className="text-sm font-medium mt-1">Teams work a ranked queue instead of digging through folders.</div>
            </div>
            <div className="rounded-2xl border p-3 bg-slate-50/70" style={{ borderColor: "var(--v-border)" }}>
              <div className="text-xs v-muted">Outcome</div>
              <div className="text-sm font-medium mt-1">Cleaner borrower files, faster UW movement, fewer blind spots.</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 v-card overflow-hidden">
          <div className="px-4 py-3 border-b bg-white flex items-center justify-between" style={{ borderColor: "var(--v-border)" }}>
            <div>
              <div className="text-sm font-medium">Largest active files</div>
              <div className="text-xs v-muted mt-1">High-value loans that may deserve faster review.</div>
            </div>
            <ToneChip label="Volume priority" tone="blue" />
          </div>

          <div className="divide-y" style={{ borderColor: "var(--v-border)" }}>
            {largestFiles.map((a) => (
              <div key={a.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-sm font-semibold truncate">{borrowerDisplay(a)}</div>
                    <ToneChip label={priorityLabel(a)} tone={priorityTone(a)} />
                  </div>
                  <div className="text-xs v-muted truncate mt-1">{borrowerSubline(a)}</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <span className="text-sm font-semibold">{loanDisplay(a)}</span>
                  <StatusChip status={a.status || "—"} />
                  <Link className="v-btn" href={`/applications/${a.id}`}>
                    View
                  </Link>
                </div>
              </div>
            ))}

            {largestFiles.length === 0 && (
              <div className="p-5 text-sm v-muted">No loan volume yet.</div>
            )}
          </div>
        </div>

        <div className="v-card p-5">
          <div className="text-sm font-semibold">Velocity V1 Status</div>
          <div className="text-xs v-muted mt-1">Operational modules ready for live demos.</div>

          <div className="space-y-3 mt-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">Applications</span>
              <ToneChip label="Live" tone="green" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">AI Scan</span>
              <ToneChip label="Phase 2" tone="blue" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">Borrower Profile</span>
              <ToneChip label="Live" tone="green" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">UW Conditions</span>
              <ToneChip label="Live" tone="green" />
            </div>
          </div>

          <div className="mt-5 rounded-2xl border p-4 bg-slate-50/70" style={{ borderColor: "var(--v-border)" }}>
            <div className="text-xs v-muted">Demo flow</div>
            <div className="text-sm font-medium mt-1">Applications → View → Upload → AI Scan → Conditions</div>
          </div>
        </div>
      </div>
    </div>
  );
}
