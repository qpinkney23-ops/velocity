"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";

type Role = "admin" | "underwriter" | "processor" | "lo" | "";

function normalizeRole(v: any): Role {
  const s = (v || "").toString().trim().toLowerCase();
  if (s === "admin") return "admin";
  if (s === "underwriter") return "underwriter";
  if (s === "processor") return "processor";
  if (s === "lo") return "lo";
  return "";
}

function isPublicPath(pathname: string) {
  // ✅ Public pages that should NOT force login
  if (pathname === "/") return true; // landing
  const prefixes = ["/pricing", "/terms", "/privacy"];
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export default function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [checked, setChecked] = useState(false);
  const [authed, setAuthed] = useState(false);

  const [uid, setUid] = useState<string>("");
  const [role, setRole] = useState<Role>("");

  const isAuthPage = useMemo(() => pathname.startsWith("/auth"), [pathname]);
  const isPublicPage = useMemo(() => isPublicPath(pathname), [pathname]);
  const requiresAuth = useMemo(() => !isAuthPage && !isPublicPage, [isAuthPage, isPublicPage]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      const ok = !!user;
      setAuthed(ok);
      setChecked(true);

      setUid(user?.uid ?? "");
      setRole("");

      // Not logged in -> only redirect if this page requires auth
      if (!ok && requiresAuth) {
        const next = encodeURIComponent(pathname || "/");
        router.replace(`/auth/login?next=${next}`);
        return;
      }

      // Logged in while on an auth page -> bounce to "next" or home
      if (ok && isAuthPage) {
        const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
        const next = params.get("next");
        router.replace(next || "/");
      }
    });

    return () => unsub();
  }, [router, isAuthPage, requiresAuth, pathname]);

  // Subscribe to users/{uid} role doc (if present)
  useEffect(() => {
    if (!uid) return;

    const unsub = onSnapshot(
      doc(db, "users", uid),
      (snap) => {
        const data = snap.exists() ? snap.data() : null;
        setRole(normalizeRole((data as any)?.role));
      },
      () => setRole("")
    );

    return () => unsub();
  }, [uid]);

  // Role-based route enforcement
  useEffect(() => {
    if (!checked) return;

    // If not authed, AuthGuard will redirect (if needed)
    if (!authed) return;

    // Admin-only
    if (pathname.startsWith("/admin")) {
      if (role !== "admin") router.replace("/");
      return;
    }

    // Underwriters page (admin + underwriter)
    if (pathname.startsWith("/underwriters")) {
      if (!(role === "admin" || role === "underwriter")) router.replace("/");
      return;
    }

    // Everything else stays open for signed-in users (V1)
  }, [checked, authed, role, pathname, router]);

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--v-bg)" }}>
        <div className="v-card p-4">Loading…</div>
      </div>
    );
  }

  // If we’re not authed and this route requires auth, we’ll redirect.
  if (!authed && requiresAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--v-bg)" }}>
        <div className="v-card p-4">Redirecting…</div>
      </div>
    );
  }

  // If authed but role isn't loaded yet, show a short guard screen ONLY for protected routes
  const protectedRoute = pathname.startsWith("/admin") || pathname.startsWith("/underwriters");

  if (authed && protectedRoute && role === "") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--v-bg)" }}>
        <div className="v-card p-4">Checking permissions…</div>
      </div>
    );
  }

  return <>{children}</>;
}
