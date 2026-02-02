"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  doc,
  addDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/components/ui/ToastProvider";

type Underwriter = {
  id: string;
  name?: string;
  email?: string;
  active?: boolean;
  createdAt?: any;
};

type AppRow = {
  id: string;
  borrowerName?: string;
  email?: string;
  loanAmount?: number;
  status?: string;
  underwriterId?: string;
  scan?: { extracted?: { borrower?: string; email?: string } } | null;
  createdAt?: any;
  updatedAt?: any;
};

function chip(kind: "ok" | "muted" | "warn") {
  if (kind === "ok") return "bg-green-50 border-green-200 text-green-800";
  if (kind === "warn") return "bg-amber-50 border-amber-200 text-amber-800";
  return "bg-gray-100 border-gray-200 text-gray-700";
}

function Chip({ label, kind }: { label: string; kind: "ok" | "muted" | "warn" }) {
  return <span className={`inline-flex items-center px-2 py-1 rounded-md border text-xs ${chip(kind)}`}>{label}</span>;
}

function money(n?: number) {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return `$${Math.round(v).toLocaleString()}`;
}

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export default function AdminPage() {
  const { toast } = useToast();

  const [underwriters, setUnderwriters] = useState<Underwriter[]>([]);
  const [apps, setApps] = useState<AppRow[]>([]);
  const [busy, setBusy] = useState(false);

  // Underwriters live
  useEffect(() => {
    const q = query(collection(db, "underwriters"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Underwriter[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setUnderwriters(list);
      },
      () => {}
    );
    return () => unsub();
  }, []);

  // Applications live (for stats)
  useEffect(() => {
    const q = query(collection(db, "applications"), orderBy("updatedAt", "desc"), limit(200));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: AppRow[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setApps(list);
      },
      () => {}
    );
    return () => unsub();
  }, []);

  const stats = useMemo(() => {
    const totalApps = apps.length;
    const totalVol = apps.reduce((acc, a) => acc + (typeof a.loanAmount === "number" ? a.loanAmount : 0), 0);

    const missingBorrower = apps.filter((a) => !(a.borrowerName || "").toString().trim()).length;
    const missingEmail = apps.filter((a) => !(a.email || "").toString().trim()).length;

    const canBackfill = apps.filter((a) => {
      const bnMissing = !(a.borrowerName || "").toString().trim();
      const emMissing = !(a.email || "").toString().trim();
      const sb = (a.scan?.extracted?.borrower || "").toString().trim();
      const se = (a.scan?.extracted?.email || "").toString().trim();
      return (bnMissing && sb) || (emMissing && se);
    }).length;

    return { totalApps, totalVol, missingBorrower, missingEmail, canBackfill };
  }, [apps]);

  async function seedDemoData() {
    if (busy) return;
    setBusy(true);

    try {
      // Create a few underwriters if none exist
      const uwSnap = await getDocs(query(collection(db, "underwriters"), limit(1)));
      if (uwSnap.empty) {
        const demoUWs = [
          { name: "A. Underwriter", email: "uw.alpha@velocity.demo", active: true },
          { name: "B. Underwriter", email: "uw.bravo@velocity.demo", active: true },
          { name: "C. Underwriter", email: "uw.charlie@velocity.demo", active: true },
        ];

        for (const u of demoUWs) {
          await addDoc(collection(db, "underwriters"), {
            ...u,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }

      // Create a few applications (lightweight)
      const names = ["Jordan Smith", "Taylor Johnson", "Casey Brown", "Morgan Davis", "Avery Wilson"];
      const statuses = ["New", "UW Review", "Conditions", "Approved"];
      for (let i = 0; i < 5; i++) {
        const borrowerName = names[rand(0, names.length - 1)];
        const email = borrowerName.toLowerCase().replace(/\s+/g, ".") + "@demo.com";
        const loanAmount = rand(120000, 650000);
        const status = statuses[rand(0, statuses.length - 1)];

        await addDoc(collection(db, "applications"), {
          borrowerName,
          email,
          loanAmount,
          status,
          underwriterId: "",
          notes: "",
          storedDocs: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      toast({ type: "success", title: "Seed complete", message: "Demo underwriters + applications created." });
    } catch (e: any) {
      toast({ type: "error", title: "Seed failed", message: e?.message ?? "Unknown error" });
    } finally {
      setBusy(false);
    }
  }

  async function backfillFromScan() {
    if (busy) return;
    setBusy(true);

    try {
      const snap = await getDocs(query(collection(db, "applications"), limit(500)));

      let scanned = 0;
      let updated = 0;
      let skipped = 0;

      for (const d of snap.docs) {
        scanned += 1;
        const data = (d.data() as any) || {};
        const borrowerName = (data.borrowerName || "").toString().trim();
        const email = (data.email || "").toString().trim();

        const scanBorrower = (data.scan?.extracted?.borrower || "").toString().trim();
        const scanEmail = (data.scan?.extracted?.email || "").toString().trim();

        const patch: any = {};
        if (!borrowerName && scanBorrower) patch.borrowerName = scanBorrower;
        if (!email && scanEmail) patch.email = scanEmail;

        if (Object.keys(patch).length === 0) {
          skipped += 1;
          continue;
        }

        patch.updatedAt = serverTimestamp();

        await updateDoc(doc(db, "applications", d.id), patch);
        updated += 1;
      }

      toast({
        type: "success",
        title: "Backfill complete",
        message: `Scanned ${scanned}. Updated ${updated}. Skipped ${skipped}.`,
        durationMs: 4200,
      });
    } catch (e: any) {
      toast({ type: "error", title: "Backfill failed", message: e?.message ?? "Unknown error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Admin</h1>
          <div className="text-sm v-muted">Manage underwriters + system utilities.</div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button className="v-btn" onClick={seedDemoData} disabled={busy}>
            {busy ? "Working…" : "Seed demo data"}
          </button>
          <button className="v-btn-primary" onClick={backfillFromScan} disabled={busy}>
            {busy ? "Backfilling…" : "Backfill missing borrower/email"}
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <div className="v-card p-4">
          <div className="text-xs v-muted">Applications</div>
          <div className="text-2xl font-semibold mt-1">{stats.totalApps}</div>
        </div>

        <div className="v-card p-4">
          <div className="text-xs v-muted">Pipeline volume</div>
          <div className="text-2xl font-semibold mt-1">{money(stats.totalVol)}</div>
        </div>

        <div className="v-card p-4">
          <div className="text-xs v-muted">Missing borrower</div>
          <div className="text-2xl font-semibold mt-1">{stats.missingBorrower}</div>
          <div className="mt-2">
            <Chip label={`${stats.canBackfill} backfillable`} kind={stats.canBackfill > 0 ? "warn" : "muted"} />
          </div>
        </div>

        <div className="v-card p-4">
          <div className="text-xs v-muted">Missing email</div>
          <div className="text-2xl font-semibold mt-1">{stats.missingEmail}</div>
          <div className="mt-2">
            <Chip label="AI Scan snapshot" kind="ok" />
          </div>
        </div>
      </div>

      <div className="v-card overflow-hidden">
        <div className="p-4 border-b bg-white flex items-center justify-between" style={{ borderColor: "var(--v-border)" }}>
          <div className="text-sm font-medium">Underwriters</div>
          <div className="text-xs v-muted">{underwriters.length} total</div>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b" style={{ borderColor: "var(--v-border)" }}>
              <tr>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {underwriters.map((u) => (
                <tr key={u.id} className="border-b last:border-b-0" style={{ borderColor: "var(--v-border)" }}>
                  <td className="p-3 font-medium">{u.name || "—"}</td>
                  <td className="p-3">{u.email || "—"}</td>
                  <td className="p-3">
                    <Chip label={u.active === false ? "Inactive" : "Active"} kind={u.active === false ? "muted" : "ok"} />
                  </td>
                </tr>
              ))}

              {underwriters.length === 0 && (
                <tr>
                  <td className="p-8 text-sm v-muted" colSpan={3}>
                    No underwriters yet. Use “Seed demo data” to create demo accounts.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="v-card p-4">
        <div className="text-sm font-medium">What this does</div>
        <div className="text-xs v-muted mt-1">
          The backfill tool permanently writes borrowerName/email onto application docs when AI Scan extracted fields exist — so your database stays clean and the UI stays consistent.
        </div>
      </div>
    </div>
  );
}
