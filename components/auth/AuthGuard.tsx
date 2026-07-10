"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

function isPublicPath(pathname: string) {
  if (pathname === "/") return true;
  if (pathname.startsWith("/auth")) return true;

  const publicPrefixes = ["/pricing", "/terms", "/privacy"];
  return publicPrefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export default function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [checked, setChecked] = useState(false);
  const [authed, setAuthed] = useState(false);

  const isPublicPage = useMemo(() => isPublicPath(pathname), [pathname]);
  const requiresAuth = useMemo(() => !isPublicPage, [isPublicPage]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      const ok = !!user;

      setAuthed(ok);
      setChecked(true);

      if (!ok && requiresAuth) {
        const next = encodeURIComponent(pathname || "/");
        router.replace(`/auth/login?next=${next}`);
        return;
      }

      if (ok && pathname.startsWith("/auth")) {
        const params = new URLSearchParams(
          typeof window !== "undefined" ? window.location.search : ""
        );
        const next = params.get("next");
        router.replace(next || "/dashboard");
      }
    });

    return () => unsub();
  }, [router, pathname, requiresAuth]);

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--v-bg)" }}>
        <div className="v-card p-4">Loading…</div>
      </div>
    );
  }

  if (!authed && requiresAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--v-bg)" }}>
        <div className="v-card p-4">Redirecting…</div>
      </div>
    );
  }

  return <>{children}</>;
}