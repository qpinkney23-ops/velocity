"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchApplicationPages } from "@/lib/applicationReadClient";

type AppDoc = {
  id: string;
  borrowerName?: string;
  email?: string;
  loanAmount?: number;
  status?: string;
  underwriterId?: string;
  underwriterName?: string;
  borrowerProfileVerified?: boolean;
  uwConditions?: any[];
  updatedAt?: any;
};

type UnderwriterDoc = {
  id: string;
  name?: string;
  email?: string;
  active?: boolean;
};

type UnderwriterWorkload = {
  files: number;
  conditions: number;
  loanVolume: number;
};

function money(n?: number) {
  return typeof n === "number" && Number.isFinite(n)
    ? `$${n.toLocaleString()}`
    : "$0";
}

function conditionCount(app: AppDoc) {
  return Array.isArray(app.uwConditions) ? app.uwConditions.length : 0;
}

function hasMissingProfile(app: AppDoc) {
  return !app.borrowerProfileVerified || !app.borrowerName || !app.email;
}

function isActiveFile(app: AppDoc) {
  const s = (app.status || "").toLowerCase();
  return s !== "approved" && s !== "completed" && s !== "closed";
}

function score(app: AppDoc) {
  let s = 0;
  if (!app.underwriterId) s += 100;
  if (hasMissingProfile(app)) s += 80;
  if (conditionCount(app) > 0) s += 60;
  if ((app.loanAmount || 0) >= 500000) s += 20;
  return s;
}

function buildIssues(app: AppDoc) {
  const list: { label: string; action: string; type: string }[] = [];

  if (!app.underwriterId) {
    list.push({ label: "No underwriter assigned", action: "Assign UW", type: "assign" });
  }

  if (hasMissingProfile(app)) {
    list.push({ label: "Missing borrower profile", action: "Complete Profile", type: "profile" });
  }

  if (conditionCount(app) > 0) {
    list.push({ label: "Conditions need review", action: "Resolve Conditions", type: "conditions" });
  }

  return list;
}

function underwriterLabel(uw?: UnderwriterDoc | null) {
  if (!uw) return "Unassigned";
  return uw.name || uw.email || "Unnamed Underwriter";
}

function emptyWorkload(): UnderwriterWorkload {
  return { files: 0, conditions: 0, loanVolume: 0 };
}

export default function WorkQueuePage() {
  const [apps, setApps] = useState<AppDoc[]>([]);
  const [underwriters, setUnderwriters] = useState<UnderwriterDoc[]>([]);
  const [currentId, setCurrentId] = useState("");
  const [assignMode, setAssignMode] = useState<"smart" | "manual">("smart");
  const [manualUnderwriterId, setManualUnderwriterId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active=true;const load=()=>fetchApplicationPages().then(({applications,assignees})=>{if(active){setApps(applications.sort((a,b)=>score(b)-score(a)));setUnderwriters(assignees.filter((u:any)=>u.active!==false))}});void load();const timer=setInterval(load,10000);return()=>{active=false;clearInterval(timer)};
  }, []);

  const queueApps = useMemo(() => {
    return apps.filter((app) => isActiveFile(app) && buildIssues(app).length > 0);
  }, [apps]);

  useEffect(() => {
    setCurrentId((existing) => {
      if (existing && queueApps.some((app) => app.id === existing)) return existing;
      return queueApps[0]?.id || "";
    });
  }, [queueApps]);

  const currentIndex = Math.max(0, queueApps.findIndex((a) => a.id === currentId));
  const current = queueApps.find((a) => a.id === currentId) || queueApps[0];

  const workloadByUnderwriter = useMemo(() => {
    const stats: Record<string, UnderwriterWorkload> = {};

    underwriters.forEach((uw) => {
      stats[uw.id] = emptyWorkload();
    });

    apps.forEach((app) => {
      if (!isActiveFile(app)) return;
      if (!app.underwriterId || !stats[app.underwriterId]) return;

      stats[app.underwriterId].files += 1;
      stats[app.underwriterId].conditions += conditionCount(app);
      stats[app.underwriterId].loanVolume += app.loanAmount || 0;
    });

    return stats;
  }, [apps, underwriters]);

  const projectedWorkloadByUnderwriter = useMemo(() => {
    const stats: Record<string, UnderwriterWorkload> = {};

    Object.entries(workloadByUnderwriter).forEach(([id, workload]) => {
      stats[id] = { ...workload };
    });

    if (current?.underwriterId && stats[current.underwriterId]) {
      stats[current.underwriterId] = {
        files: Math.max(0, stats[current.underwriterId].files - 1),
        conditions: Math.max(
          0,
          stats[current.underwriterId].conditions - conditionCount(current)
        ),
        loanVolume: Math.max(
          0,
          stats[current.underwriterId].loanVolume - (current.loanAmount || 0)
        ),
      };
    }

    return stats;
  }, [workloadByUnderwriter, current]);

  const smartUnderwriter = useMemo(() => {
    if (!underwriters.length) return null;

    return [...underwriters].sort((a, b) => {
      const aWork = projectedWorkloadByUnderwriter[a.id] || emptyWorkload();
      const bWork = projectedWorkloadByUnderwriter[b.id] || emptyWorkload();

      if (aWork.files !== bWork.files) return aWork.files - bWork.files;
      if (aWork.conditions !== bWork.conditions) return aWork.conditions - bWork.conditions;
      if (aWork.loanVolume !== bWork.loanVolume) return aWork.loanVolume - bWork.loanVolume;

      return underwriterLabel(a).localeCompare(underwriterLabel(b));
    })[0];
  }, [underwriters, projectedWorkloadByUnderwriter]);

  const selectedManualUnderwriter = useMemo(() => {
    return underwriters.find((uw) => uw.id === manualUnderwriterId) || null;
  }, [underwriters, manualUnderwriterId]);

  const assignmentTarget =
    assignMode === "manual" ? selectedManualUnderwriter : smartUnderwriter;

  const issues = useMemo(() => {
    if (!current) return [];
    return buildIssues(current);
  }, [current]);

  async function assignUnderwriter() {
    if (!current || busy) return;

    if (!assignmentTarget) {
      alert(
        assignMode === "manual"
          ? "Choose an underwriter first."
          : "No active underwriter found. Add one on the Underwriters page first."
      );
      return;
    }

    setBusy(true);

    try {
      const response=await fetch(`/api/applications/${current.id}/workflow`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({commandType:"assign_underwriter",assigneeId:assignmentTarget.id,expectedVersion:(current as any).workflowVersion||(current as any).authorizationVersion,idempotencyKey:crypto.randomUUID()})});if(!response.ok)throw new Error("Assignment failed.");

      setCurrentId((existing) => existing || current.id);
    } finally {
      setBusy(false);
    }
  }

  function goNext() {
    if (!queueApps.length) return;

    const nextIndex = Math.min(currentIndex + 1, queueApps.length - 1);
    setCurrentId(queueApps[nextIndex]?.id || "");
  }

  function goPrevious() {
    if (!queueApps.length) return;

    const previousIndex = Math.max(currentIndex - 1, 0);
    setCurrentId(queueApps[previousIndex]?.id || "");
  }

  if (!current) {
    return (
      <div className="min-h-screen bg-gray-100 p-6 space-y-6">
        <div className="flex gap-2">
          <Link href="/" className="px-3 py-2 rounded-lg bg-white border text-sm hover:bg-gray-50">Dashboard</Link>
          <Link href="/applications" className="px-3 py-2 rounded-lg bg-white border text-sm hover:bg-gray-50">Applications</Link>
          <Link href="/queue" className="px-3 py-2 rounded-lg bg-slate-900 text-white border text-sm">Queue</Link>
          <Link href="/underwriters" className="px-3 py-2 rounded-lg bg-white border text-sm hover:bg-gray-50">Underwriters</Link>
        </div>

        <div className="bg-white border rounded-xl p-6 shadow-sm">
          <div className="text-lg font-semibold">Queue clear</div>
          <div className="text-sm text-gray-500 mt-1">
            No active files currently have queue flags.
          </div>
        </div>
      </div>
    );
  }

  const progress = ((currentIndex + 1) / Math.max(queueApps.length, 1)) * 100;
  const currentProjectedWorkload = assignmentTarget
    ? projectedWorkloadByUnderwriter[assignmentTarget.id] || emptyWorkload()
    : emptyWorkload();

  return (
    <div className="min-h-screen bg-gray-100 p-6 space-y-6">
      <div className="flex gap-2">
        <Link href="/" className="px-3 py-2 rounded-lg bg-white border text-sm hover:bg-gray-50">Dashboard</Link>
        <Link href="/applications" className="px-3 py-2 rounded-lg bg-white border text-sm hover:bg-gray-50">Applications</Link>
        <Link href="/queue" className="px-3 py-2 rounded-lg bg-slate-900 text-white border text-sm">Queue</Link>
        <Link href="/underwriters" className="px-3 py-2 rounded-lg bg-white border text-sm hover:bg-gray-50">Underwriters</Link>
      </div>

      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-xl p-6 shadow-lg space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-lg font-semibold">Execution Mode</h1>
            <p className="text-xs text-slate-300">Working through flagged files only.</p>
          </div>
          <div className="text-sm text-slate-300">{currentIndex + 1} / {queueApps.length}</div>
        </div>

        <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
          <div className="bg-blue-500 h-full transition-all" style={{ width: `${progress}%` }} />
        </div>

        <div className="text-xs text-slate-400">
          {currentIndex} flagged files cleared • {Math.max(queueApps.length - currentIndex - 1, 0)} remaining
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 bg-white border border-gray-200 rounded-xl p-6 shadow-md space-y-5">
          <div>
            <h2 className="text-2xl font-semibold">
              {current.borrowerName || "Pending borrower profile"}
            </h2>
            <p className="text-gray-500">{money(current.loanAmount)}</p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <span className="px-3 py-1 text-xs bg-gray-200 rounded-full">
              {current.status || "New"}
            </span>

            <span className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded-full border">
              {conditionCount(current)} conditions
            </span>

            <span className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded-full border">
              Assigned: {current.underwriterName || "Unassigned"}
            </span>
          </div>

          <div className="rounded-xl border bg-slate-50 p-4 space-y-4">
            <div>
              <div className="text-sm font-semibold">Assignment Control</div>
              <div className="text-xs text-gray-500">
                Smart assigns by workload, then condition load, then loan volume.
              </div>
            </div>

            <div className="text-xs bg-white border rounded-lg p-3">
              <span className="text-gray-500">Current assigned UW:</span>{" "}
              <span className="font-semibold">
                {current.underwriterName || "Unassigned"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setAssignMode("smart")}
                className={
                  assignMode === "smart"
                    ? "rounded-lg px-3 py-2 bg-blue-600 text-white text-sm font-semibold"
                    : "rounded-lg px-3 py-2 bg-white border text-gray-700 text-sm hover:bg-gray-50"
                }
              >
                Smart Assign
              </button>

              <button
                onClick={() => setAssignMode("manual")}
                className={
                  assignMode === "manual"
                    ? "rounded-lg px-3 py-2 bg-blue-600 text-white text-sm font-semibold"
                    : "rounded-lg px-3 py-2 bg-white border text-gray-700 text-sm hover:bg-gray-50"
                }
              >
                Manual Assign
              </button>
            </div>

            {assignMode === "smart" ? (
              <div className="bg-white border rounded-lg p-3 text-sm space-y-2">
                <div className="text-xs text-gray-500">
                  Recommended underwriter
                </div>

                <div className="font-semibold">
                  {smartUnderwriter
                    ? `${underwriterLabel(smartUnderwriter)} • ${currentProjectedWorkload.files} active files • ${currentProjectedWorkload.conditions} open conditions • ${money(currentProjectedWorkload.loanVolume)} volume`
                    : "No active underwriter available"}
                </div>

                <div className="text-xs text-gray-500">
                  Tie-breaker: lowest active files → lowest open condition load → lowest assigned loan volume → name.
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <select
                  value={manualUnderwriterId}
                  onChange={(e) => setManualUnderwriterId(e.target.value)}
                  className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                >
                  <option value="">Choose exact underwriter...</option>
                  {underwriters.map((uw) => {
                    const workload = workloadByUnderwriter[uw.id] || emptyWorkload();

                    return (
                      <option key={uw.id} value={uw.id}>
                        {underwriterLabel(uw)} — {workload.files} files • {workload.conditions} conditions • {money(workload.loanVolume)}
                      </option>
                    );
                  })}
                </select>

                <div className="text-xs text-gray-500">
                  Manual mode overrides Smart Assign and writes the exact underwriter selected here.
                </div>
              </div>
            )}

            <button
              onClick={assignUnderwriter}
              disabled={busy}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              {busy
                ? "Saving..."
                : current.underwriterId
                ? "Update Assignment"
                : "Assign Underwriter"}
            </button>
          </div>

          <div className="space-y-3">
            {issues.map((issue) => (
              <div
                key={issue.type}
                className="flex items-center justify-between p-4 rounded-lg bg-red-100 border-l-4 border-red-500 shadow-sm"
              >
                <span className="text-sm text-red-800 font-semibold">⚠ {issue.label}</span>

                <Link
                  href={`/applications/${current.id}`}
                  className="text-xs bg-white border px-3 py-1 rounded-md hover:bg-gray-100 font-medium"
                >
                  {issue.type === "assign" ? "Use assignment control above" : issue.action}
                </Link>
              </div>
            ))}
          </div>

          <div className="flex gap-4 pt-4">
            <Link
              href={`/applications/${current.id}`}
              className="bg-blue-600 hover:bg-blue-700 text-white px-7 py-3 rounded-lg text-sm font-semibold shadow-md"
            >
              Resolve & Open File
            </Link>

            <button
              onClick={goNext}
              disabled={currentIndex >= queueApps.length - 1}
              className="px-4 py-2 border rounded-lg text-sm bg-white hover:bg-gray-50 disabled:opacity-40"
            >
              Skip
            </button>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
          <h3 className="font-semibold text-sm text-gray-700">Decision Panel</h3>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span>Risk</span>
              <span className="text-red-500 font-semibold">
                {issues.length >= 3 ? "High" : issues.length ? "Medium" : "Low"}
              </span>
            </div>

            <div className="flex justify-between">
              <span>Conditions</span>
              <span>{conditionCount(current)}</span>
            </div>

            <div className="flex justify-between">
              <span>Blockers</span>
              <span>{issues.length}</span>
            </div>

            <div className="pt-3 border-t text-xs text-gray-500">Assignment</div>

            <div className="bg-gray-200 p-3 rounded-lg text-sm font-semibold">
              {current.underwriterName || underwriterLabel(assignmentTarget)}
            </div>

            <div className="pt-3 border-t text-xs text-gray-500">Recommended Path</div>

            <div className="text-xs text-gray-600">
              Assign UW → Complete Profile → Resolve Conditions
            </div>

            <div className="pt-2 text-xs text-gray-400">Est. time to clear: 3–5 min</div>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center text-sm text-gray-500">
        <button
          onClick={goPrevious}
          disabled={currentIndex <= 0}
          className="disabled:opacity-40"
        >
          ← Previous
        </button>

        <span>Stay in flow</span>

        <button
          onClick={goNext}
          disabled={currentIndex >= queueApps.length - 1}
          className="disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
