"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { db, storage } from "@/lib/firebase";
import {
  arrayUnion,
  collection,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { useToast } from "@/components/ui/ToastProvider";

/** =========================
 * Types
 * ========================= */

type Underwriter = {
  id: string;
  name?: string;
  email?: string;
  active?: boolean;
};

type StoredDoc = {
  name: string;
  url: string;
  path: string;
  uploadedAtMs: number;
};

type ScanCondition = { label: string; severity: "low" | "med" | "high"; evidence?: string };

type ScanResult = {
  mode: "pdf-parse" | "unknown";
  scannedAtMs: number;
  docName?: string;
  summary: string;
  preview?: string;
  extracted: {
    borrower?: string;
    coBorrower?: string;
    email?: string;
    loanAmount?: number | null;

    fullName?: string;
    dob?: string;
    ssnLast4?: string;
    income?: number | null; // annual income
    creditScore?: number | null;
    address?: string;
    employerAddress?: string;
  };
  conditions: ScanCondition[];
  redFlags: string[];
};

/**
 * Firestore borrowerProfile is NOT flat.
 * It’s a map of fields like:
 * borrowerProfile.fullName.value
 * borrowerProfile.fullName.status
 */
type BorrowerProfileField = {
  value?: any;
  status?: string; // "extracted" | "missing" | etc
  source?: string; // "ai"
  updatedAtMs?: number;
};

type BorrowerProfileFS = {
  [k: string]: BorrowerProfileField | undefined;
};

type BorrowerProfileFlat = {
  fullName?: string;
  email?: string;
  dob?: string;
  ssnLast4?: string;
  income?: number | null;
  creditScore?: number | null;
  address?: string;
  employerAddress?: string;
  loanAmount?: number | null;
};

type UWCondition = {
  id: string;
  label: string;
  severity: "low" | "med" | "high";
  status: "open" | "done";
  source: "borrower_profile" | "manual";
  evidence?: string;
  createdAtMs: number;
  updatedAtMs: number;
};

type AppDoc = {
  borrowerName?: string;
  email?: string;
  loanAmount?: number;
  status?: string;
  underwriterId?: string;
  notes?: string;

  storedDocs?: StoredDoc[];
  scan?: ScanResult;

  borrowerProfile?: BorrowerProfileFS; // FS shape
  borrowerProfileVerified?: Record<string, boolean>; // verified separate + simple

  uwConditions?: UWCondition[];

  // legacy/compat
  conditions?: any[];

  createdAt?: any;
  updatedAt?: any;
};

/** =========================
 * Helpers
 * ========================= */

function formatMoney(n?: number | null) {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return `$${v.toLocaleString()}`;
}

function fmtDateTimeFromMs(ms?: number) {
  if (!ms || !Number.isFinite(ms)) return "—";
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function sanitizeFilename(name: string) {
  return (name || "document").replace(/[^\w.\-()\s]/g, "").replace(/\s+/g, " ").trim();
}

function makeId(prefix = "cond") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
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

function PriorityChip({ p }: { p: "low" | "med" | "high" }) {
  const map: Record<string, { bg: string; border: string; text: string; label: string }> = {
    high: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", label: "High" },
    med: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800", label: "Med" },
    low: { bg: "bg-gray-100", border: "border-gray-200", text: "text-gray-700", label: "Low" },
  };
  const c = map[p];
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-md border text-xs ${c.bg} ${c.border} ${c.text}`}>
      {c.label}
    </span>
  );
}

/** Pull .value out of borrowerProfileFS safely */
function getBPValue(bp: BorrowerProfileFS | null | undefined, key: keyof BorrowerProfileFlat) {
  const node = (bp?.[String(key)] as BorrowerProfileField | undefined) || undefined;
  return node?.value;
}

function normalizeBorrowerProfile(bp: BorrowerProfileFS | null | undefined): BorrowerProfileFlat {
  const fullName = (getBPValue(bp, "fullName") ?? "").toString().trim();
  const email = (getBPValue(bp, "email") ?? "").toString().trim();
  const dob = (getBPValue(bp, "dob") ?? "").toString().trim();

  const ssnRaw = (getBPValue(bp, "ssnLast4") ?? "").toString().trim();
  const ssnLast4 = ssnRaw ? ssnRaw.slice(-4) : "";

  const incomeRaw = getBPValue(bp, "income");
  const creditRaw = getBPValue(bp, "creditScore");
  const loanRaw = getBPValue(bp, "loanAmount");

  const income = typeof incomeRaw === "number" ? incomeRaw : incomeRaw ? Number(incomeRaw) : null;
  const creditScore = typeof creditRaw === "number" ? creditRaw : creditRaw ? Number(creditRaw) : null;
  const loanAmount = typeof loanRaw === "number" ? loanRaw : loanRaw ? Number(loanRaw) : null;

  const address = (getBPValue(bp, "address") ?? "").toString().trim();
  const employerAddress = (getBPValue(bp, "employerAddress") ?? "").toString().trim();

  return {
    fullName,
    email,
    dob,
    ssnLast4,
    income: Number.isFinite(income as any) ? income : null,
    creditScore: Number.isFinite(creditScore as any) ? creditScore : null,
    address,
    employerAddress,
    loanAmount: Number.isFinite(loanAmount as any) ? loanAmount : null,
  };
}

/**
 * IMPORTANT:
 * Explicit return type prevents TS literal widening for status/source.
 */
function buildConditionsFromBorrowerProfile(
  profile: BorrowerProfileFlat | null,
  verified: Record<string, boolean>,
  existing: UWCondition[] = []
): UWCondition[] {
  const keepDone = new Map<string, UWCondition>();
  for (const c of existing || []) {
    if ((c.label || "").trim() && c.status === "done") keepDone.set(c.label.trim(), c);
  }

  const now = Date.now();
  const out: UWCondition[] = [];

  const add = (label: string, severity: "low" | "med" | "high", evidence?: string) => {
    const key = label.trim();
    const doneMatch = keepDone.get(key);

    const status: UWCondition["status"] = doneMatch ? ("done" as const) : ("open" as const);

    const next: UWCondition = {
      id: doneMatch?.id || makeId("uw"),
      label,
      severity,
      status,
      source: "borrower_profile" as const,
      evidence,
      createdAtMs: doneMatch?.createdAtMs || now,
      updatedAtMs: now,
    };

    out.push(next);
  };

  const p = profile || {};
  const v = verified || {};

  // Required fields
  if (!p.fullName) add("Verify borrower full legal name", "high", "Borrower Profile: fullName is missing.");
  if (!p.dob) add("Verify borrower date of birth", "high", "Borrower Profile: dob is missing.");
  if (!p.ssnLast4) add("Collect SSN (last 4) / verify identity", "high", "Borrower Profile: ssnLast4 is missing.");
  if (!p.address) add("Verify current primary address", "med", "Borrower Profile: address is missing.");
  if (!p.income) add("Verify annual income documentation (paystubs/W-2)", "high", "Borrower Profile: income is missing.");
  if (!p.loanAmount) add("Confirm requested loan amount", "med", "Borrower Profile: loanAmount is missing.");
  if (!p.employerAddress) add("Verify employer / employer address", "low", "Borrower Profile: employerAddress is missing.");

  // Credit thresholds
  if (typeof p.creditScore === "number") {
    if (p.creditScore < 620) add("Credit score below 620 – review eligibility / pricing", "high", `Credit score = ${p.creditScore}.`);
    else if (p.creditScore < 680) add("Credit score 620–679 – watch overlays / pricing", "med", `Credit score = ${p.creditScore}.`);
  } else {
    add("Pull / confirm credit score", "med", "Borrower Profile: creditScore is missing.");
  }

  // Verification toggles (if value present but not verified)
  const needsVerify = (field: keyof BorrowerProfileFlat, label: string, severity: "low" | "med" | "high") => {
    const val = p[field];
    const hasValue = !(val === "" || val === null || val === undefined);
    if (hasValue && !v[String(field)]) add(label, severity, `${String(field)} present but not marked verified.`);
  };

  needsVerify("fullName", "Mark Full Name as verified", "med");
  needsVerify("dob", "Mark DOB as verified", "med");
  needsVerify("ssnLast4", "Mark SSN (last 4) as verified", "med");
  needsVerify("address", "Mark Address as verified", "low");
  needsVerify("income", "Mark Income as verified", "med");
  needsVerify("creditScore", "Mark Credit Score as verified", "low");
  needsVerify("employerAddress", "Mark Employer Address as verified", "low");
  needsVerify("loanAmount", "Mark Loan Amount as verified", "low");

  // Sort: open first, then severity
  const sevRank: Record<string, number> = { high: 0, med: 1, low: 2 };
  out.sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    return (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9);
  });

  // De-dupe by label
  const seen = new Set<string>();
  return out.filter((c) => {
    const k = c.label.trim();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function verificationFieldFromLabel(label: string): keyof BorrowerProfileFlat | null {
  const t = (label || "").trim();

  const map: Record<string, keyof BorrowerProfileFlat> = {
    "Mark Full Name as verified": "fullName",
    "Mark DOB as verified": "dob",
    "Mark SSN (last 4) as verified": "ssnLast4",
    "Mark Address as verified": "address",
    "Mark Income as verified": "income",
    "Mark Credit Score as verified": "creditScore",
    "Mark Employer Address as verified": "employerAddress",
    "Mark Loan Amount as verified": "loanAmount",
  };

  return map[t] ?? null;
}

/** =========================
 * Page
 * ========================= */

export default function ApplicationDetailPage() {
  const params = useParams();
  const id = String((params as any)?.id || "");
  const { toast } = useToast();

  const [app, setApp] = useState<AppDoc | null>(null);
  const [loading, setLoading] = useState(true);

  const [underwriters, setUnderwriters] = useState<Underwriter[]>([]);

  const [statusDraft, setStatusDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [uwDraft, setUwDraft] = useState("");

  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);

  const [tab, setTab] = useState<"Borrower Profile" | "Summary" | "Conditions" | "Docs">("Borrower Profile");
  const [scanning, setScanning] = useState(false);

  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const appRef = useMemo(() => doc(db, "applications", id), [id]);

  // Live application
  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(
      appRef,
      (snap) => {
        const data = (snap.data() as any) || null;
        setApp(data);
        setLoading(false);

        if (data) {
          setStatusDraft((data.status || "New").toString());
          setNotesDraft((data.notes || "").toString());
          setUwDraft((data.underwriterId || "").toString());
        }
      },
      (err) => {
        console.error("onSnapshot error", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [appRef, id]);

  // Underwriters list
  useEffect(() => {
    const qy = query(collection(db, "underwriters"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const list: Underwriter[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setUnderwriters(list);
      },
      () => {}
    );
    return () => unsub();
  }, []);

  const storedDocs = (app?.storedDocs || []) as StoredDoc[];
  const scan = (app?.scan || null) as ScanResult | null;
  const hasScan = !!scan;

  const borrowerProfileFS = (app?.borrowerProfile || {}) as BorrowerProfileFS;
  const borrowerProfile = useMemo(() => normalizeBorrowerProfile(borrowerProfileFS), [borrowerProfileFS]);

  const verified = ((app as any)?.borrowerProfileVerified || {}) as Record<string, boolean>;
  const uwConditions = ((app as any)?.uwConditions || []) as UWCondition[];

  const statusOptions = useMemo(() => ["New", "UW Review", "Conditions", "Approved"] as const, []);

  async function saveStatus() {
    try {
      await updateDoc(appRef, { status: statusDraft, updatedAt: serverTimestamp() });
      toast({ type: "success", title: "Status saved", message: `Set to “${statusDraft}”` });
    } catch (e: any) {
      toast({ type: "error", title: "Status save failed", message: e?.message ?? "Unknown error" });
    }
  }

  async function saveNotes() {
    try {
      await updateDoc(appRef, { notes: notesDraft, updatedAt: serverTimestamp() });
      toast({ type: "success", title: "Notes saved" });
    } catch (e: any) {
      toast({ type: "error", title: "Notes save failed", message: e?.message ?? "Unknown error" });
    }
  }

  async function saveUnderwriter() {
    try {
      await updateDoc(appRef, { underwriterId: uwDraft || "", updatedAt: serverTimestamp() });
      toast({ type: "success", title: "Underwriter assigned" });
    } catch (e: any) {
      toast({ type: "error", title: "Assignment failed", message: e?.message ?? "Unknown error" });
    }
  }

  async function handleUpload(file: File) {
    if (!id) return;

    setUploading(true);
    setUploadPct(0);

    const cleanName = sanitizeFilename(file.name);
    const path = `applications/${id}/${Date.now()}_${cleanName}`;
    const storageRef = ref(storage, path);

    try {
      const task = uploadBytesResumable(storageRef, file);

      await new Promise<void>((resolve, reject) => {
        task.on(
          "state_changed",
          (snap) => {
            const pctVal = snap.totalBytes ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0;
            setUploadPct(pctVal);
          },
          (err) => reject(err),
          () => resolve()
        );
      });

      const url = await getDownloadURL(storageRef);

      const docMeta: StoredDoc = {
        name: cleanName,
        url,
        path,
        uploadedAtMs: Date.now(),
      };

      await updateDoc(appRef, {
        storedDocs: arrayUnion(docMeta as any),
        updatedAt: serverTimestamp(),
      });

      toast({ type: "success", title: "Upload complete", message: cleanName });
      setTab("Docs");
    } catch (e: any) {
      toast({ type: "error", title: "Upload failed", message: e?.message ?? "Unknown error" });
    } finally {
      setUploading(false);
      setUploadPct(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function deleteOneDoc(target: StoredDoc) {
    if (!target?.path) return;

    try {
      await deleteObject(ref(storage, target.path));
    } catch {
      // ignore storage delete failure (still remove from Firestore list)
    }

    try {
      const next = storedDocs.filter((d) => d.path !== target.path);
      await updateDoc(appRef, { storedDocs: next as any, updatedAt: serverTimestamp() });
      toast({ type: "success", title: "Doc deleted", message: target.name });
    } catch (e: any) {
      toast({ type: "error", title: "Delete failed", message: e?.message ?? "Unknown error" });
    }
  }

  async function deleteAllDocs() {
    if (storedDocs.length === 0) return;

    try {
      for (const d of storedDocs) {
        try {
          if (d?.path) await deleteObject(ref(storage, d.path));
        } catch {}
      }

      await updateDoc(appRef, {
        storedDocs: [],
        scan: deleteField(),
        uwConditions: [],
        conditions: [], // legacy
        updatedAt: serverTimestamp(),
      });

      toast({ type: "success", title: "All docs deleted", message: "Cleared docs + scan + conditions." });
      setTab("Docs");
    } catch (e: any) {
      toast({ type: "error", title: "Delete all failed", message: e?.message ?? "Unknown error" });
    }
  }

  async function runAiScan() {
    if (scanning) return;

    if (storedDocs.length === 0) {
      toast({ type: "error", title: "Upload required", message: "Upload a document before running AI Scan." });
      return;
    }

    setScanning(true);
    setSummaryExpanded(false);
    setPreviewExpanded(false);

    try {
      const latest = storedDocs[storedDocs.length - 1];

      // IMPORTANT: always refresh URL from path when possible
      let freshUrl = latest.url;
      if (latest?.path) {
        freshUrl = await getDownloadURL(ref(storage, latest.path));
      }

      const res = await fetch(`/api/applications/${id}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentUrl: freshUrl,
          documentName: latest.name,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        const msg = data?.error || `Analyze failed (${res.status})`;
        throw new Error(msg);
      }

      const scanToSave: ScanResult = {
        mode: (data.mode || "unknown") as any,
        scannedAtMs: Date.now(),
        docName: data.docName || latest.name,
        summary: (data.summary || "").toString(),
        preview: (data.preview || "").toString(),
        extracted: {
          borrower: (data?.extracted?.borrower || "").toString(),
          coBorrower: (data?.extracted?.coBorrower || "").toString(),
          email: (data?.extracted?.email || "").toString(),
          loanAmount: data?.extracted?.loanAmount ?? null,

          fullName: (data?.extracted?.fullName || data?.extracted?.borrower || "").toString(),
          dob: (data?.extracted?.dob || "").toString(),
          ssnLast4: (data?.extracted?.ssnLast4 || "").toString(),
          income: data?.extracted?.income ?? null,
          creditScore: data?.extracted?.creditScore ?? null,
          address: (data?.extracted?.address || "").toString(),
          employerAddress: (data?.extracted?.employerAddress || "").toString(),
        },
        conditions: Array.isArray(data.conditions) ? data.conditions : [],
        redFlags: Array.isArray(data.redFlags) ? data.redFlags : [],
      };

      await updateDoc(appRef, {
        scan: scanToSave as any,
        updatedAt: serverTimestamp(),
      });

      toast({ type: "success", title: "AI Scan complete", message: "Saved scan to Firestore." });
      setTab("Borrower Profile");
    } catch (e: any) {
      toast({ type: "error", title: "AI Scan failed", message: e?.message ?? "Unknown error", durationMs: 6000 });
      console.error("runAiScan error", e);
    } finally {
      setScanning(false);
    }
  }

  async function saveUwConditions(next: UWCondition[]) {
    try {
      console.log("✅ saving uwConditions...", next.length);
      await updateDoc(appRef, {
        uwConditions: next as any,
        // legacy mirror so you SEE it no matter what:
        conditions: next as any,
        updatedAt: serverTimestamp(),
      });
      console.log("✅ uwConditions saved.");
    } catch (e: any) {
      console.error("❌ saveUwConditions failed:", e);
      throw e;
    }
  }

  async function refreshConditions() {
    try {
      console.log("✅ refreshConditions clicked");
      const next = buildConditionsFromBorrowerProfile(borrowerProfile, verified, uwConditions || []);
      console.log("✅ generated conditions:", next.length);

      await saveUwConditions(next);

      toast({
        type: "success",
        title: "Conditions refreshed",
        message: `${next.filter((x) => x.status === "open").length} open item(s) generated.`,
      });
      setTab("Conditions");
    } catch (e: any) {
      toast({ type: "error", title: "Refresh failed", message: e?.message ?? "Unknown error", durationMs: 7000 });
      console.error("refreshConditions error", e);
    }
  }

  // ✅ Bulletproof: these exist INSIDE the component and auto-regenerate conditions immediately
  const markVerified = async (field: keyof BorrowerProfileFlat) => {
    try {
      const nextVerified = { ...(verified || {}), [String(field)]: true };

      await updateDoc(appRef, {
        borrowerProfileVerified: nextVerified as any,
        updatedAt: serverTimestamp(),
      });

      const regenerated = buildConditionsFromBorrowerProfile(borrowerProfile, nextVerified, uwConditions || []);
      await saveUwConditions(regenerated);

      toast({ type: "success", title: "Verified", message: `${String(field)} marked verified.` });
    } catch (e: any) {
      toast({ type: "error", title: "Verify failed", message: e?.message ?? "Unknown error" });
      console.error("markVerified error", e);
    }
  };

  const clearVerified = async (field: keyof BorrowerProfileFlat) => {
    try {
      const nextVerified = { ...(verified || {}) };
      delete nextVerified[String(field)];

      await updateDoc(appRef, {
        borrowerProfileVerified: nextVerified as any,
        updatedAt: serverTimestamp(),
      });

      const regenerated = buildConditionsFromBorrowerProfile(borrowerProfile, nextVerified, uwConditions || []);
      await saveUwConditions(regenerated);

      toast({ type: "success", title: "Unverified", message: `${String(field)} cleared.` });
    } catch (e: any) {
      toast({ type: "error", title: "Update failed", message: e?.message ?? "Unknown error" });
      console.error("clearVerified error", e);
    }
  };

  async function toggleCondition(condId: string) {
    try {
      const list = uwConditions || [];
      const target = list.find((c) => c.id === condId);
      if (!target) return;

      const field = verificationFieldFromLabel(target.label);
      const nextStatus: UWCondition["status"] = target.status === "done" ? ("open" as const) : ("done" as const);

      // what the verified map SHOULD be after the click
      const nextVerifiedMap = (() => {
        const v = { ...(verified || {}) };
        if (field) {
          if (nextStatus === "done") v[String(field)] = true;
          else delete v[String(field)];
        }
        return v;
      })();

      // Persist verified first (only if this is a verification condition)
      if (field) {
        await updateDoc(appRef, { borrowerProfileVerified: nextVerifiedMap as any, updatedAt: serverTimestamp() });
      }

      // Update clicked condition status immediately
      const next = list.map((c) => (c.id === condId ? { ...c, status: nextStatus, updatedAtMs: Date.now() } : c));
      await saveUwConditions(next);

      // Auto-regenerate to remove “Mark X as verified” items instantly
      if (field) {
        const regenerated = buildConditionsFromBorrowerProfile(borrowerProfile, nextVerifiedMap, next);
        await saveUwConditions(regenerated);
      }
    } catch (e: any) {
      toast({ type: "error", title: "Update failed", message: e?.message ?? "Unknown error" });
      console.error("toggleCondition error", e);
    }
  }

  const uwLabel = useMemo(() => {
    const u = underwriters.find((x) => x.id === (app?.underwriterId || ""));
    if (!u) return "Unassigned";
    return u.name || u.email || "Underwriter";
  }, [underwriters, app?.underwriterId]);

  const borrowerDisplay =
    (app?.borrowerName || "").toString().trim() ||
    borrowerProfile.fullName ||
    (scan?.extracted?.fullName || scan?.extracted?.borrower || "").toString().trim() ||
    "Borrower";

  const emailDisplay =
    (app?.email || "").toString().trim() ||
    borrowerProfile.email ||
    (scan?.extracted?.email || "").toString().trim() ||
    "—";

  const loanDisplay =
    typeof app?.loanAmount === "number" ? app.loanAmount : borrowerProfile.loanAmount ?? (scan?.extracted?.loanAmount ?? null);

  function tabBtn(active: boolean) {
    return active ? "v-btn-primary" : "v-btn";
  }

  if (loading) {
    return (
      <div className="v-card p-6">
        <div className="text-sm v-muted">Loading application…</div>
      </div>
    );
  }

  if (!app) {
    return (
      <div className="v-card p-6">
        <div className="text-sm text-red-600">Application not found.</div>
      </div>
    );
  }

  const canShowScanUI = hasScan || storedDocs.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs v-muted">Application</div>
          <div className="text-2xl font-semibold">{borrowerDisplay}</div>
          <div className="text-sm v-muted">{emailDisplay !== "—" ? emailDisplay : `ID: ${id}`}</div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="v-chip">{formatMoney(loanDisplay)}</span>
          <StatusChip status={app.status || "New"} />
          <span className="v-chip">{uwLabel}</span>
          <span className="v-chip">{hasScan ? "Scan: Completed" : "Scan: —"}</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 space-y-3">
          {/* Workflow */}
          <div className="v-card p-5">
            <div className="text-sm font-semibold">Workflow</div>
            <div className="text-xs v-muted mt-1">Status + underwriting assignment.</div>

            <div className="mt-4 grid md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs v-muted mb-1">Status</div>
                <select
                  className="w-full border rounded-xl p-2 bg-white text-sm"
                  style={{ borderColor: "rgba(15,23,42,0.10)" }}
                  value={statusDraft}
                  onChange={(e) => setStatusDraft(e.target.value)}
                  disabled={uploading || scanning}
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button className="v-btn-primary mt-2" onClick={saveStatus} disabled={uploading || scanning}>
                  Save status
                </button>
              </div>

              <div>
                <div className="text-xs v-muted mb-1">Assign underwriter</div>
                <select
                  className="w-full border rounded-xl p-2 bg-white text-sm"
                  style={{ borderColor: "rgba(15,23,42,0.10)" }}
                  value={uwDraft}
                  onChange={(e) => setUwDraft(e.target.value)}
                  disabled={uploading || scanning}
                >
                  <option value="">Unassigned</option>
                  {underwriters.map((u) => (
                    <option key={u.id} value={u.id}>
                      {(u.name || u.email || u.id) + (u.active === false ? " (inactive)" : "")}
                    </option>
                  ))}
                </select>
                <button className="v-btn mt-2" onClick={saveUnderwriter} disabled={uploading || scanning}>
                  Save assignment
                </button>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="v-card p-5">
            <div className="text-sm font-semibold">Internal notes</div>

            <textarea
              className="w-full border rounded-xl p-3 bg-white text-sm mt-3"
              style={{ borderColor: "rgba(15,23,42,0.10)", minHeight: 140 }}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="Add notes…"
              disabled={uploading || scanning}
            />

            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <button className="v-btn-primary" onClick={saveNotes} disabled={uploading || scanning}>
                Save notes
              </button>
              <button
                className="v-btn"
                onClick={() => {
                  setNotesDraft(app.notes || "");
                  toast({ type: "info", title: "Reset notes", message: "Draft restored to last saved version." });
                }}
                disabled={uploading || scanning}
              >
                Reset
              </button>
            </div>
          </div>

          {/* AI Scan Tabs */}
          <div className="v-card p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-semibold">AI Scan</div>
                <div className="text-xs v-muted mt-1">
                  {scan?.scannedAtMs ? `Last scanned: ${fmtDateTimeFromMs(scan.scannedAtMs)}` : "Run scan to generate summary + profile."}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button className={tabBtn(tab === "Borrower Profile")} onClick={() => setTab("Borrower Profile")}>
                  Borrower Profile
                </button>
                <button className={tabBtn(tab === "Summary")} onClick={() => setTab("Summary")}>
                  Summary
                </button>
                <button className={tabBtn(tab === "Conditions")} onClick={() => setTab("Conditions")}>
                  Conditions
                </button>
                <button className={tabBtn(tab === "Docs")} onClick={() => setTab("Docs")}>
                  Docs
                </button>

                <button className="v-btn-primary" onClick={runAiScan} disabled={scanning || storedDocs.length === 0}>
                  {scanning ? "Scanning…" : "Run AI Scan"}
                </button>
              </div>
            </div>

            {!hasScan && (
              <div className="mt-4 text-sm v-muted">
                No scan results yet. Upload a document and click <span className="font-semibold">Run AI Scan</span>.
              </div>
            )}

            {canShowScanUI && (
              <div className="mt-4">
                {tab === "Borrower Profile" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <div className="text-sm font-semibold">Borrower Profile</div>
                        <div className="text-xs v-muted mt-1">Based on borrowerProfile.*.value</div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <button className="v-btn-primary" onClick={refreshConditions}>
                          Refresh conditions
                        </button>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-3">
                      {([
                        { key: "fullName", label: "Full name", val: borrowerProfile.fullName },
                        { key: "email", label: "Email", val: borrowerProfile.email },
                        { key: "dob", label: "DOB", val: borrowerProfile.dob },
                        { key: "ssnLast4", label: "SSN (last 4)", val: borrowerProfile.ssnLast4 },
                        { key: "income", label: "Annual income", val: borrowerProfile.income, num: true },
                        { key: "creditScore", label: "Credit score", val: borrowerProfile.creditScore, num: true },
                        { key: "address", label: "Address", val: borrowerProfile.address },
                        { key: "employerAddress", label: "Employer address", val: borrowerProfile.employerAddress },
                        { key: "loanAmount", label: "Loan amount", val: borrowerProfile.loanAmount, num: true, money: true },
                      ] as any[]).map((f) => {
                        const isVerified = !!verified?.[String(f.key)];
                        const missing = f.val === "" || f.val === null || f.val === undefined;

                        return (
                          <div key={f.key} className="rounded-xl border p-3" style={{ borderColor: "rgba(15,23,42,0.10)" }}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs v-muted">{f.label}</div>
                              {isVerified ? (
                                <span className="inline-flex items-center px-2 py-1 rounded-md border text-xs bg-green-50 border-green-200 text-green-800">
                                  Verified
                                </span>
                              ) : missing ? (
                                <span className="inline-flex items-center px-2 py-1 rounded-md border text-xs bg-red-50 border-red-200 text-red-700">
                                  Missing
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-1 rounded-md border text-xs bg-amber-50 border-amber-200 text-amber-800">
                                  Extracted
                                </span>
                              )}
                            </div>

                            <div className="mt-2 text-sm" style={{ color: "rgba(15,23,42,0.82)" }}>
                              {f.money ? formatMoney(typeof f.val === "number" ? f.val : null) : missing ? "—" : String(f.val)}
                            </div>

                            <div className="mt-2 flex gap-2 flex-wrap">
                              <button className="v-btn" onClick={() => markVerified(f.key)} disabled={missing}>
                                Mark verified
                              </button>
                              <button className="v-btn" onClick={() => clearVerified(f.key)} disabled={!isVerified}>
                                Unverify
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {tab === "Summary" && (
                  <div className="space-y-3">
                    {!scan ? (
                      <div className="text-sm v-muted">
                        No scan yet. Upload a doc and click <span className="font-semibold">Run AI Scan</span>.
                      </div>
                    ) : (
                      <>
                        <div className="v-card-soft p-4">
                          <div className="text-xs v-muted">Scanned doc</div>
                          <div className="text-sm font-semibold mt-1">{scan.docName || "—"}</div>
                          <div className="text-xs v-muted mt-1">
                            Mode: {scan.mode} • {fmtDateTimeFromMs(scan.scannedAtMs)}
                          </div>
                        </div>

                        <div className="v-card-soft p-4">
                          <div className="text-xs v-muted">Summary</div>
                          <div className="text-sm mt-2" style={{ color: "rgba(15,23,42,0.82)" }}>
                            {summaryExpanded
                              ? scan.summary
                              : (scan.summary || "").slice(0, 520) + ((scan.summary || "").length > 520 ? "…" : "")}
                          </div>
                          {(scan.summary || "").length > 520 && (
                            <button className="v-btn mt-2" onClick={() => setSummaryExpanded((v) => !v)}>
                              {summaryExpanded ? "Show less" : "Show more"}
                            </button>
                          )}
                        </div>

                        {!!scan.preview && (
                          <div className="v-card-soft p-4">
                            <div className="text-xs v-muted">Text preview</div>
                            <div className="text-sm mt-2" style={{ color: "rgba(15,23,42,0.82)" }}>
                              {previewExpanded ? scan.preview : scan.preview.slice(0, 800) + (scan.preview.length > 800 ? "…" : "")}
                            </div>
                            {scan.preview.length > 800 && (
                              <button className="v-btn mt-2" onClick={() => setPreviewExpanded((v) => !v)}>
                                {previewExpanded ? "Show less" : "Show more"}
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {tab === "Conditions" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <div className="text-sm font-semibold">Underwriting conditions</div>
                        <div className="text-xs v-muted mt-1">Generated from Borrower Profile values + verified flags.</div>
                      </div>
                      <button className="v-btn-primary" onClick={refreshConditions}>
                        Refresh conditions
                      </button>
                    </div>

                    {uwConditions.length === 0 ? (
                      <div className="text-sm v-muted">
                        No UW conditions yet. Click <span className="font-semibold">Refresh conditions</span>.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {uwConditions.map((c) => (
                          <div key={c.id} className="v-card-soft p-4">
                            <div className="flex items-start justify-between gap-2 flex-wrap">
                              <div>
                                <div
                                  className="text-sm font-semibold"
                                  style={{ textDecoration: c.status === "done" ? "line-through" : "none" }}
                                >
                                  {c.label}
                                </div>
                                {c.evidence && <div className="text-xs v-muted mt-1">{c.evidence}</div>}
                              </div>

                              <div className="flex items-center gap-2">
                                <PriorityChip p={c.severity} />
                                <button className="v-btn" onClick={() => toggleCondition(c.id)}>
                                  {c.status === "done" ? "Reopen" : "Mark done"}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {(scan?.conditions || []).length > 0 && (
                      <div className="v-card-soft p-4">
                        <div className="text-xs v-muted">AI keyword hits (from scan)</div>
                        <div className="mt-2 space-y-2">
                          {(scan?.conditions || []).map((k, i) => (
                            <div key={i} className="rounded-xl border p-3" style={{ borderColor: "rgba(15,23,42,0.10)" }}>
                              <div className="flex items-center justify-between">
                                <div className="text-sm font-semibold">{k.label}</div>
                                <PriorityChip p={k.severity} />
                              </div>
                              {k.evidence && <div className="text-xs v-muted mt-1">{k.evidence}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {tab === "Docs" && (
                  <div className="space-y-2">
                    {storedDocs.length === 0 ? (
                      <div className="text-sm v-muted">No stored docs yet.</div>
                    ) : (
                      storedDocs
                        .slice()
                        .reverse()
                        .map((d, idx) => (
                          <div
                            key={`${d.path}_${idx}`}
                            className="rounded-xl border p-3 text-sm"
                            style={{ borderColor: "rgba(15,23,42,0.10)", background: "rgba(255,255,255,0.75)" }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-medium">{d.name}</div>
                                <a href={d.url} target="_blank" rel="noreferrer" className="text-xs v-muted mt-1 block">
                                  Open
                                </a>
                                <div className="text-xs v-muted mt-1">{fmtDateTimeFromMs(d.uploadedAtMs)}</div>
                              </div>
                              <button className="v-btn" onClick={() => deleteOneDoc(d)} disabled={uploading || scanning}>
                                Delete
                              </button>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right rail */}
        <div className="lg:col-span-1 space-y-3">
          <div className="v-card p-5">
            <div className="text-sm font-semibold">Documents</div>
            <div className="text-xs v-muted mt-1">Upload docs to Storage.</div>

            <input
              ref={fileInputRef}
              type="file"
              className="mt-3 block w-full text-sm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
              disabled={uploading || scanning}
            />

            {uploading && (
              <div className="mt-3">
                <div className="text-xs v-muted">Uploading… {uploadPct}%</div>
                <div className="h-2 rounded-xl mt-2" style={{ background: "rgba(15,23,42,0.06)", overflow: "hidden" }}>
                  <div
                    className="h-2 rounded-xl"
                    style={{
                      width: `${uploadPct}%`,
                      background: "rgba(31,111,235,0.75)",
                      transition: "width 150ms linear",
                    }}
                  />
                </div>
              </div>
            )}

            <div className="mt-4 flex gap-2 flex-wrap">
              <button className="v-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading || scanning}>
                Upload doc
              </button>
              <button className="v-btn-primary" onClick={runAiScan} disabled={uploading || scanning || storedDocs.length === 0}>
                {scanning ? "Scanning…" : "Run AI Scan"}
              </button>
              <button className="v-btn" onClick={deleteAllDocs} disabled={uploading || scanning || storedDocs.length === 0}>
                Delete all docs
              </button>
            </div>
          </div>

          <div className="v-card p-5">
            <div className="text-sm font-semibold">Quick actions</div>
            <div className="text-xs v-muted mt-1">Generate underwriting items directly from the profile.</div>

            <button className="v-btn-primary mt-3 w-full" onClick={refreshConditions}>
              Refresh conditions
            </button>

            <div className="text-xs v-muted mt-3">
              After you click refresh, Firestore should show <span className="font-semibold">uwConditions</span> (array) and also{" "}
              <span className="font-semibold">conditions</span> (array).
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
