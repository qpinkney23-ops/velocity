"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchApplicationPages } from "@/lib/applicationReadClient";
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
  scan?: {
    extracted?: {
      borrower?: string;
      email?: string;
    };
  } | null;
  createdAt?: any;
  updatedAt?: any;
};

function chip(kind: "ok" | "muted" | "warn" | "blue") {
  if (kind === "ok") return "bg-green-50 border-green-200 text-green-800";
  if (kind === "warn") return "bg-amber-50 border-amber-200 text-amber-800";
  if (kind === "blue") return "bg-blue-50 border-blue-200 text-blue-800";
  return "bg-gray-100 border-gray-200 text-gray-700";
}

function Chip({ label, kind }: { label: string; kind: "ok" | "muted" | "warn" | "blue" }) {
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-md border text-xs ${chip(kind)}`}>
      {label}
    </span>
  );
}

function money(n?: number) {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return `$${Math.round(v).toLocaleString()}`;
}

function pct(value: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

export default function AdminPage() {
  const { toast } = useToast();

  const [underwriters, setUnderwriters] = useState<Underwriter[]>([]);
  const [apps, setApps] = useState<AppRow[]>([]);
  const [billingBusy, setBillingBusy] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  useEffect(() => {
    let active=true;const load=()=>fetchApplicationPages(100).then(({applications,assignees})=>{if(active){setApps(applications.slice(0,200));setUnderwriters(assignees)}});void load();const timer=setInterval(load,15000);return()=>{active=false;clearInterval(timer)};
  }, []);

  const stats = useMemo(() => {
    const totalApps = apps.length;
    const totalVol = apps.reduce((acc, a) => acc + (typeof a.loanAmount === "number" ? a.loanAmount : 0), 0);

    const missingBorrower = apps.filter((a) => !(a.borrowerName || "").toString().trim()).length;
    const missingEmail = apps.filter((a) => !(a.email || "").toString().trim()).length;

    const assigned = apps.filter((a) => !!(a.underwriterId || "").toString().trim()).length;
    const unassigned = totalApps - assigned;

    const activeUnderwriters = underwriters.filter((u) => u.active !== false).length;

    return {
      totalApps,
      totalVol,
      missingBorrower,
      missingEmail,
      assigned,
      unassigned,
      activeUnderwriters,
      assignmentCoverage: pct(assigned, totalApps),
    };
  }, [apps, underwriters]);

  async function startIntroCheckout() {
    if (checkoutBusy) return;
    setCheckoutBusy(true);

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.url) {
        throw new Error(data?.error || `Checkout failed (${res.status})`);
      }

      window.location.href = data.url;
    } catch (e: any) {
      toast({
        type: "error",
        title: "Checkout failed",
        message: e?.message ?? "Unable to open Stripe Checkout.",
        durationMs: 7000,
      });
    } finally {
      setCheckoutBusy(false);
    }
  }

  async function openStripePortal() {
    if (billingBusy) return;
    setBillingBusy(true);

    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.url) {
        window.location.href = data.url;
        return;
      }

      window.open("https://dashboard.stripe.com/test/customers", "_blank", "noopener,noreferrer");

      toast({
        type: "info",
        title: "Stripe dashboard opened",
        message:
          "Customer portal is not configured in this environment yet, so Velocity opened Stripe test dashboard instead.",
        durationMs: 6000,
      });
    } catch {
      window.open("https://dashboard.stripe.com/test/customers", "_blank", "noopener,noreferrer");

      toast({
        type: "info",
        title: "Stripe dashboard opened",
        message:
          "Billing portal is not configured locally yet. Production clients will use the hosted customer portal.",
        durationMs: 6000,
      });
    } finally {
      setBillingBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <a href="/admin/governance" className="v-card p-4 flex items-center justify-between gap-3 border-blue-200 bg-blue-50"><div><div className="font-semibold text-blue-950">Enterprise Administration & Governance</div><div className="text-xs text-blue-800 mt-1">Manage organization policy, teams, memberships, roles, permissions, feature flags, and governance audit.</div></div><span className="text-blue-800">Open →</span></a>
      <div className="rounded-2xl border bg-slate-950 text-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-300">Velocity Command Center</div>
            <h1 className="text-3xl font-semibold mt-2">Admin Console</h1>
            <div className="text-sm text-slate-300 mt-2 max-w-2xl">
              Executive control layer for underwriting operations, team capacity, billing readiness, and system data health.
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Chip label="Owner / Admin" kind="blue" />
            <Chip label="Live Firestore Data" kind="ok" />
            <Chip label="Demo-Safe Billing" kind="warn" />
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-3 mt-6">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-slate-300">Applications</div>
            <div className="text-2xl font-semibold mt-1">{stats.totalApps}</div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-slate-300">Pipeline Volume</div>
            <div className="text-2xl font-semibold mt-1">{money(stats.totalVol)}</div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-slate-300">Assignment Coverage</div>
            <div className="text-2xl font-semibold mt-1">{stats.assignmentCoverage}</div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-slate-300">Active Underwriters</div>
            <div className="text-2xl font-semibold mt-1">{stats.activeUnderwriters}</div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <div className="v-card p-4">
          <div className="text-xs v-muted">Missing Borrower</div>
          <div className="text-2xl font-semibold mt-1">{stats.missingBorrower}</div>
        </div>

        <div className="v-card p-4">
          <div className="text-xs v-muted">Missing Email</div>
          <div className="text-2xl font-semibold mt-1">{stats.missingEmail}</div>
        </div>

        <div className="v-card p-4">
          <div className="text-xs v-muted">Assigned Files</div>
          <div className="text-2xl font-semibold mt-1">{stats.assigned}</div>
          <div className="mt-2">
            <Chip label={`${stats.unassigned} unassigned`} kind={stats.unassigned > 0 ? "warn" : "ok"} />
          </div>
        </div>

        <div className="v-card p-4">
          <div className="text-xs v-muted">Application Integrity</div>
          <div className="text-sm font-semibold mt-1">Server-authoritative mutations</div>
          <div className="text-xs v-muted mt-2">Legacy scan-derived borrower repair is retired.</div>
        </div>
      </div>

      <div className="v-card p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-sm font-semibold">Revenue Control</div>
            <div className="text-xs v-muted mt-1 max-w-2xl">
              Stripe-backed subscription actions for selling Velocity. Use checkout for new prospects and billing portal for existing customers.
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button className="v-btn-primary" onClick={startIntroCheckout} disabled={checkoutBusy}>
              {checkoutBusy ? "Opening Checkout..." : "Start Intro Checkout"}
            </button>
            <button className="v-btn" onClick={openStripePortal} disabled={billingBusy}>
              {billingBusy ? "Opening Billing..." : "Manage Existing Billing"}
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-3 mt-4">
          <div className="v-card p-4">
            <div className="text-xs v-muted">New Customer Flow</div>
            <div className="text-sm font-semibold mt-1">Stripe Checkout</div>
            <div className="mt-2">
              <Chip label="$1,500/mo Intro Partner" kind="ok" />
            </div>
            <div className="text-xs v-muted mt-2">
              Sends prospects to a clean payment page using STRIPE_INTRO_PRICE_ID.
            </div>
          </div>

          <div className="v-card p-4">
            <div className="text-xs v-muted">Existing Customer Flow</div>
            <div className="text-sm font-semibold mt-1">Billing Portal</div>
            <div className="mt-2">
              <Chip label="Manage Subscription" kind="blue" />
            </div>
            <div className="text-xs v-muted mt-2">
              Used after a customer already exists in Stripe.
            </div>
          </div>

          <div className="v-card p-4">
            <div className="text-xs v-muted">Client Visibility</div>
            <div className="mt-2">
              <Chip label="Admin Only" kind="ok" />
            </div>
            <div className="text-xs v-muted mt-2">
              Revenue controls stay separate from the loan workflow screens.
            </div>
          </div>
        </div>
      </div>

      <div className="v-card overflow-hidden">
        <div className="p-4 border-b bg-white flex items-center justify-between" style={{ borderColor: "var(--v-border)" }}>
          <div>
            <div className="text-sm font-semibold">Underwriter Directory</div>
            <div className="text-xs v-muted mt-1">Live team roster used for queue assignment and workload balancing.</div>
          </div>
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
                    No underwriters found. Add underwriters from Firestore or onboarding workflow.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="v-card p-4">
        <div className="text-sm font-semibold">System Notes</div>
        <div className="text-xs v-muted mt-1">
          Admin actions are intentionally separated from the borrower workflow. This keeps demos clean while preserving
          owner-level operational controls.
        </div>
      </div>
    </div>
  );
}
