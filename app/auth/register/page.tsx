"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { exchangeSession, sessionErrorMessage } from "@/lib/client/auth/velocitySession";

function initials(email: string) {
  const s = (email || "").trim();
  if (!s) return "V";
  const base = s.includes("@") ? s.split("@")[0] : s;
  const parts = base.split(/[.\-_ ]+/).filter(Boolean);
  const a = (parts[0] || "V").slice(0, 1).toUpperCase();
  const b = (parts[1] || parts[0] || "L").slice(0, 1).toUpperCase();
  return (a + b).trim() || "V";
}

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const canSubmit = useMemo(() => {
    if (!email.trim() || !email.includes("@")) return false;
    if (!pw || pw.length < 6) return false;
    return true;
  }, [email, pw]);

  async function onRegister() {
    if (!canSubmit || loading) return;
    setLoading(true);
    setMsg("");

    let profileCreated = false;
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pw);

      const token=await cred.user.getIdToken();
      const profile=await fetch("/api/auth/profile",{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${token}`},body:JSON.stringify({displayName:name.trim()})});
      if(!profile.ok)throw new Error("Profile creation failed");
      profileCreated = true;

      await exchangeSession(cred.user);
      router.push("/dashboard");
    } catch (error) {
      await signOut(auth).catch(() => undefined);
      setMsg(profileCreated ? `Your account was created, but a secure session could not be started. Please sign in again. ${sessionErrorMessage(error)}` : "Unable to create your account. Please check your details and try again.");
      setLoading(false);
    }
  }

  const avatar = useMemo(() => initials(email), [email]);

  return (
    <div
      className="min-h-screen"
      style={{
        background:
          "radial-gradient(1200px 800px at 20% 20%, rgba(31,111,235,0.20), transparent 55%), radial-gradient(1000px 700px at 80% 70%, rgba(99,102,241,0.14), transparent 55%), linear-gradient(180deg, #050A16 0%, #071229 55%, #050A16 100%)",
      }}
    >
      <div className="min-h-screen grid lg:grid-cols-2">
        {/* Left brand panel */}
        <div className="hidden lg:flex items-center justify-center p-10">
          <div className="max-w-lg w-full">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{
                  background: "rgba(31,111,235,0.18)",
                  border: "1px solid rgba(31,111,235,0.28)",
                }}
              >
                <div className="w-3.5 h-3.5 rounded-full" style={{ background: "#1F6FEB" }} />
              </div>
              <div className="leading-tight">
                <div className="text-xl font-semibold" style={{ color: "rgba(255,255,255,0.92)" }}>
                  Velocity
                </div>
                <div className="text-sm" style={{ color: "rgba(255,255,255,0.60)" }}>
                  Loan Workflow Platform
                </div>
              </div>
            </div>

            <div className="mt-10 space-y-4">
              <div className="text-3xl font-semibold" style={{ color: "rgba(255,255,255,0.92)" }}>
                Create your account.
                <br />
                Start building pipeline speed.
              </div>

              <div className="text-sm leading-6" style={{ color: "rgba(255,255,255,0.66)" }}>
                New accounts remain unprovisioned until an approved tenant membership is assigned.
              </div>

              <div
                className="rounded-2xl p-4 mt-6"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.86)" }}>
                  Pro tip
                </div>
                <div className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.60)" }}>
                  Tenant roles come only from governed membership records, never from browser profiles.
                </div>
              </div>
            </div>

            <div className="mt-10 text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
              V1 Workflow Platform • AI Scan is Phase 2
            </div>
          </div>
        </div>

        {/* Right auth card */}
        <div className="flex items-center justify-center p-6">
          <div className="w-full max-w-md">
            <div
              className="rounded-3xl p-6 md:p-7"
              style={{
                background: "rgba(255,255,255,0.92)",
                border: "1px solid rgba(15,23,42,0.10)",
                boxShadow: "0 30px 70px rgba(0,0,0,0.35)",
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-semibold">Register</div>
                  <div className="text-sm v-muted">Create your Velocity account.</div>
                </div>
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold border"
                  style={{
                    borderColor: "rgba(15,23,42,0.10)",
                    background:
                      "linear-gradient(135deg, rgba(255,255,255,0.9), rgba(31,111,235,0.12))",
                    color: "rgba(15,23,42,0.70)",
                  }}
                  title="User"
                >
                  {avatar}
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <label className="space-y-1 block">
                  <div className="text-xs v-muted">Name (optional)</div>
                  <input
                    className="w-full border rounded-xl p-3 bg-white"
                    style={{ borderColor: "var(--v-border)" }}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full name"
                  />
                </label>

                <label className="space-y-1 block">
                  <div className="text-xs v-muted">Email</div>
                  <input
                    className="w-full border rounded-xl p-3 bg-white"
                    style={{ borderColor: "var(--v-border)" }}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                  />
                </label>

                <label className="space-y-1 block">
                  <div className="text-xs v-muted">Password</div>
                  <input
                    type="password"
                    className="w-full border rounded-xl p-3 bg-white"
                    style={{ borderColor: "var(--v-border)" }}
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    placeholder="Min 6 characters"
                  />
                </label>

                <button
                  className={`w-full ${canSubmit && !loading ? "v-btn-primary" : "v-btn opacity-50 cursor-not-allowed"}`}
                  disabled={!canSubmit || loading}
                  onClick={onRegister}
                >
                  {loading ? "Creating…" : "Create account"}
                </button>

                {msg && <div className="text-sm">{msg}</div>}

                <div className="text-sm v-muted">
                  Already have an account?{" "}
                  <Link href="/auth/login" className="underline">
                    Log in
                  </Link>
                </div>
              </div>
            </div>

            <div className="mt-4 text-center text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
              Velocity • Secure registration
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
