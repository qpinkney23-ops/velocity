"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

function moneyToNumber(input: string) {
  const cleaned = (input || "").replace(/[^0-9.]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

export default function NewApplicationPage() {
  const router = useRouter();

  const [borrowerName, setBorrowerName] = useState("");
  const [email, setEmail] = useState("");
  const [loanAmountText, setLoanAmountText] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

  const loanAmount = useMemo(() => moneyToNumber(loanAmountText), [loanAmountText]);

  const isValidEmail = useMemo(() => {
    const e = email.trim();
    return e.includes("@") && e.includes(".");
  }, [email]);

  const canSubmit = useMemo(() => {
    if (!borrowerName.trim()) return false;
    if (!isValidEmail) return false;
    if (!loanAmount || loanAmount <= 0) return false;
    return true;
  }, [borrowerName, isValidEmail, loanAmount]);

  async function onCreate() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setMsg("");

    try {
      const docRef = await addDoc(collection(db, "applications"), {
        borrowerName: borrowerName.trim(),
        email: email.trim().toLowerCase(),
        loanAmount,
        status: "New",
        underwriterId: "",
        notes: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setMsg("✅ Application created");
      router.push(`/applications/${docRef.id}`);
    } catch (e: any) {
      setMsg(`❌ Create failed: ${e?.message ?? "Unknown error"}`);
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">New Application</h1>
          <div className="text-sm v-muted">Create a new loan file in Velocity.</div>
        </div>

        <div className="flex items-center gap-2">
          <button className="v-btn" onClick={() => router.push("/applications")}>
            Cancel
          </button>
          <button
            className={`v-btn-primary ${!canSubmit || submitting ? "opacity-60 cursor-not-allowed" : ""}`}
            disabled={!canSubmit || submitting}
            onClick={onCreate}
          >
            {submitting ? "Creating…" : "Create"}
          </button>
        </div>
      </div>

      {msg && <div className="text-sm">{msg}</div>}

      {/* Form */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 v-card p-5">
          <div className="text-sm font-medium">Borrower</div>
          <div className="text-xs v-muted mt-1">These fields power Applications + Borrowers directory.</div>

          <div className="mt-4 grid md:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <div className="text-xs v-muted">Borrower name</div>
              <input
                className="w-full border rounded-xl p-3 bg-white text-sm"
                style={{ borderColor: "rgba(15,23,42,0.10)" }}
                value={borrowerName}
                onChange={(e) => setBorrowerName(e.target.value)}
                placeholder="John Smith"
              />
            </label>

            <label className="block space-y-1">
              <div className="text-xs v-muted">Email</div>
              <input
                className="w-full border rounded-xl p-3 bg-white text-sm"
                style={{ borderColor: "rgba(15,23,42,0.10)" }}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@email.com"
              />
              {!isValidEmail && email.trim().length > 0 && (
                <div className="text-xs text-red-600">Enter a valid email.</div>
              )}
            </label>

            <label className="block space-y-1 md:col-span-2">
              <div className="text-xs v-muted">Loan amount</div>
              <input
                className="w-full border rounded-xl p-3 bg-white text-sm"
                style={{ borderColor: "rgba(15,23,42,0.10)" }}
                value={loanAmountText}
                onChange={(e) => setLoanAmountText(e.target.value)}
                placeholder="350000"
              />
              <div className="text-xs v-muted">Stored as a number. Preview: ${loanAmount.toLocaleString()}</div>
            </label>
          </div>
        </div>

        {/* Right panel */}
        <div className="v-card p-5 space-y-3">
          <div className="text-sm font-medium">Defaults</div>

          <div className="v-card-soft p-4">
            <div className="text-xs v-muted">Status</div>
            <div className="text-sm font-semibold mt-1">New</div>
            <div className="text-xs v-muted mt-1">Workflow will constrain next steps.</div>
          </div>

          <div className="v-card-soft p-4">
            <div className="text-xs v-muted">Underwriter</div>
            <div className="text-sm font-semibold mt-1">Unassigned</div>
            <div className="text-xs v-muted mt-1">Assign on the application detail page.</div>
          </div>

          <div className="v-card-soft p-4">
            <div className="text-xs v-muted">Notes</div>
            <div className="text-sm font-semibold mt-1">Empty</div>
            <div className="text-xs v-muted mt-1">Add internal notes on detail page.</div>
          </div>

          <button
            className={`w-full v-btn-primary ${!canSubmit || submitting ? "opacity-60 cursor-not-allowed" : ""}`}
            disabled={!canSubmit || submitting}
            onClick={onCreate}
          >
            {submitting ? "Creating…" : "Create application"}
          </button>

          {!canSubmit && (
            <div className="text-xs v-muted">
              Required: borrower name + valid email + loan amount.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
