"use client";

import { useEffect, useMemo, useState } from "react";
import { auth, db, storage } from "@/lib/firebase";
import { useToast } from "@/components/ui/ToastProvider";

type Stage = { id: string; label: string };

function safeGet(key: string, fallback: string) {
  try {
    const v = localStorage.getItem(key);
    return v && v.trim().length ? v : fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function mkId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function SettingsPage() {
  const { toast } = useToast();

  const [workspaceName, setWorkspaceName] = useState("Velocity");
  const [accent, setAccent] = useState("#1f6feb");
  const [stages, setStages] = useState<Stage[]>([
    { id: "new", label: "New" },
    { id: "uw", label: "UW Review" },
    { id: "cond", label: "Conditions" },
    { id: "approved", label: "Approved" },
  ]);

  const [editingNewStage, setEditingNewStage] = useState("");
  const [savedAt, setSavedAt] = useState<string>("");

  useEffect(() => {
    setWorkspaceName(safeGet("velocity.workspaceName", "Velocity"));
    setAccent(safeGet("velocity.accent", "#1f6feb"));

    const raw = safeGet("velocity.stages", "");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          const cleaned = parsed
            .filter((x) => x && typeof x.label === "string")
            .map((x) => ({ id: x.id || mkId(), label: String(x.label).trim() }))
            .filter((x) => x.label.length > 0);
          if (cleaned.length) setStages(cleaned);
        }
      } catch {}
    }
  }, []);

  const status = useMemo(() => {
    const user = auth?.currentUser;
    const hasAuth = !!auth;
    const hasDb = !!db;
    const hasStorage = !!storage;

    return {
      signedIn: user ? "Signed in" : "Not signed in",
      email: user?.email || "—",
      auth: hasAuth ? "Connected" : "Not connected",
      firestore: hasDb ? "Connected" : "Not connected",
      storage: hasStorage ? "Connected" : "Not connected",
    };
  }, []);

  function saveAll() {
    safeSet("velocity.workspaceName", workspaceName.trim() || "Velocity");
    safeSet("velocity.accent", accent.trim() || "#1f6feb");
    safeSet("velocity.stages", JSON.stringify(stages));

    const t = new Date().toLocaleString();
    setSavedAt(t);
    toast({ type: "success", title: "Settings saved", message: `Saved ${t}` });
  }

  function resetDefaults() {
    setWorkspaceName("Velocity");
    setAccent("#1f6feb");
    setStages([
      { id: "new", label: "New" },
      { id: "uw", label: "UW Review" },
      { id: "cond", label: "Conditions" },
      { id: "approved", label: "Approved" },
    ]);
    toast({ type: "info", title: "Reset to defaults", message: "Click Save to apply." });
  }

  function addStage() {
    const label = editingNewStage.trim();
    if (!label) return;
    setStages((prev) => [...prev, { id: mkId(), label }]);
    setEditingNewStage("");
  }

  function removeStage(id: string) {
    setStages((prev) => prev.filter((s) => s.id !== id));
  }

  function moveStage(id: string, dir: -1 | 1) {
    setStages((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const copy = prev.slice();
      const tmp = copy[idx];
      copy[idx] = copy[nextIdx];
      copy[nextIdx] = tmp;
      return copy;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <div className="text-sm v-muted">Workspace preferences + system status.</div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button className="v-btn" onClick={resetDefaults}>Reset</button>
          <button className="v-btn-primary" onClick={saveAll}>Save changes</button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-3">
        {/* Workspace */}
        <div className="v-card p-5 lg:col-span-2">
          <div className="text-sm font-semibold">Workspace</div>
          <div className="text-xs v-muted mt-1">These save locally (safe). Later we can sync to Firestore.</div>

          <div className="mt-4 grid md:grid-cols-2 gap-3">
            <div>
              <div className="text-xs v-muted mb-1">Workspace name</div>
              <input
                className="w-full border rounded-xl p-2 bg-white text-sm"
                style={{ borderColor: "rgba(15,23,42,0.10)" }}
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="Velocity"
              />
            </div>

            <div>
              <div className="text-xs v-muted mb-1">Accent color</div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                  className="h-10 w-12 rounded-xl border bg-white"
                  style={{ borderColor: "rgba(15,23,42,0.10)" }}
                />
                <input
                  className="flex-1 border rounded-xl p-2 bg-white text-sm"
                  style={{ borderColor: "rgba(15,23,42,0.10)" }}
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                />
                <span
                  className="inline-flex items-center px-3 py-2 rounded-xl text-xs border"
                  style={{
                    borderColor: "rgba(15,23,42,0.10)",
                    background: "rgba(255,255,255,0.7)",
                  }}
                >
                  Preview
                  <span
                    className="ml-2 inline-block w-3 h-3 rounded-full"
                    style={{ background: accent }}
                  />
                </span>
              </div>
              <div className="text-[11px] v-muted mt-2">
                (Optional) Later we can wire this to CSS variables.
              </div>
            </div>
          </div>

          {/* Stages */}
          <div className="mt-5">
            <div className="text-sm font-semibold">Default pipeline stages</div>
            <div className="text-xs v-muted mt-1">Reorder to match your workflow.</div>

            <div className="mt-3 space-y-2">
              {stages.map((s, idx) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-xl border p-3 bg-white"
                  style={{ borderColor: "rgba(15,23,42,0.10)" }}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{s.label}</div>
                    <div className="text-xs v-muted">Stage {idx + 1}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button className="v-btn" onClick={() => moveStage(s.id, -1)} disabled={idx === 0}>
                      ↑
                    </button>
                    <button className="v-btn" onClick={() => moveStage(s.id, 1)} disabled={idx === stages.length - 1}>
                      ↓
                    </button>
                    <button className="v-btn" onClick={() => removeStage(s.id)}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <input
                className="border rounded-xl p-2 bg-white text-sm w-[260px]"
                style={{ borderColor: "rgba(15,23,42,0.10)" }}
                value={editingNewStage}
                onChange={(e) => setEditingNewStage(e.target.value)}
                placeholder="Add a stage…"
              />
              <button className="v-btn" onClick={addStage}>Add stage</button>
            </div>

            {savedAt ? <div className="text-[11px] v-muted mt-2">Last saved: {savedAt}</div> : null}
          </div>
        </div>

        {/* System status */}
        <div className="v-card p-5">
          <div className="text-sm font-semibold">System status</div>
          <div className="text-xs v-muted mt-1">Quick health check for demos.</div>

          <div className="mt-4 space-y-2 text-sm">
            <div className="v-card-soft p-3">
              <div className="text-xs v-muted">Auth</div>
              <div className="font-semibold mt-1">{status.auth}</div>
              <div className="text-xs v-muted mt-1">{status.signedIn}</div>
              <div className="text-xs v-muted mt-1">{status.email}</div>
            </div>

            <div className="v-card-soft p-3">
              <div className="text-xs v-muted">Firestore</div>
              <div className="font-semibold mt-1">{status.firestore}</div>
            </div>

            <div className="v-card-soft p-3">
              <div className="text-xs v-muted">Storage</div>
              <div className="font-semibold mt-1">{status.storage}</div>
            </div>

            <div className="v-card-soft p-3">
              <div className="text-xs v-muted">Recommended demo URL</div>
              <div className="font-semibold mt-1">http://velocity.local:3000</div>
              <div className="text-xs v-muted mt-1">Use :3001 if your dev server chooses it.</div>
            </div>
          </div>
        </div>
      </div>

      <div className="v-card p-4">
        <div className="text-sm font-medium">Next polish</div>
        <div className="text-xs v-muted mt-1">
          If you want more “color” without risk: we’ll add a subtle accent glow to topbar and buttons using CSS variables (one file).
        </div>
      </div>
    </div>
  );
}
