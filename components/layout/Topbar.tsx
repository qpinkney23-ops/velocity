"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useToast } from "@/components/ui/ToastProvider";

function safeGet(key: string, fallback: string) {
  try {
    const v = localStorage.getItem(key);
    return v && v.trim().length ? v : fallback;
  } catch {
    return fallback;
  }
}

function initialsFrom(user: User | null) {
  const name = (user?.displayName || "").trim();
  const email = (user?.email || "").trim();

  const base = name || email;
  if (!base) return "U";

  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    const a = (parts[0]?.[0] || "").toUpperCase();
    const b = (parts[1]?.[0] || "").toUpperCase();
    return (a + b) || a || "U";
  }

  return (email.slice(0, 2) || "U").toUpperCase();
}

function titleFromPath(pathname: string) {
  const p = (pathname || "/").split("?")[0];

  if (p.startsWith("/applications/new")) return "New Application";
  if (p.startsWith("/applications/") && p !== "/applications") return "Application";
  if (p === "/applications") return "Applications";
  if (p === "/dashboard") return "Dashboard";
  if (p === "/borrowers") return "Borrowers";
  if (p === "/underwriters") return "Underwriters";
  if (p === "/admin") return "Admin";
  if (p === "/settings") return "Settings";
  return "Velocity";
}

export default function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();

  const [user, setUser] = useState<User | null>(auth?.currentUser ?? null);
  const [workspaceName, setWorkspaceName] = useState("Velocity");
  const [open, setOpen] = useState(false);

  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setWorkspaceName(safeGet("velocity.workspaceName", "Velocity"));

    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!open) return;
      const el = menuRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const pageTitle = useMemo(() => titleFromPath(pathname), [pathname]);

  async function doSignOut() {
    try {
      if (!auth) return;
      await signOut(auth);
      toast({ type: "success", title: "Signed out" });
      router.push("/auth/login");
    } catch (e: any) {
      toast({
        type: "error",
        title: "Sign out failed",
        message: e?.message ?? "Unknown error",
        durationMs: 3200,
      });
    }
  }

  function go(path: string) {
    setOpen(false);
    router.push(path);
  }

  return (
    <header
      className="v-topbar sticky top-0 z-20"
      style={{
        background: "rgba(245,247,251,0.85)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderBottom: "1px solid rgba(15,23,42,0.06)",
      }}
    >
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        {/* Left: page identity */}
        <div className="min-w-0">
          <div className="text-[12px] v-muted leading-tight truncate">{workspaceName}</div>
          <div className="text-[16px] font-semibold leading-tight truncate">{pageTitle}</div>
        </div>

        {/* Right: profile dropdown */}
        <div className="flex items-center gap-2" ref={menuRef}>
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-2xl border px-3 py-2 bg-white"
            style={{
              borderColor: "rgba(15,23,42,0.10)",
              boxShadow: "0 10px 24px rgba(15,23,42,0.08)",
            }}
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <div
              className="w-9 h-9 rounded-full border flex items-center justify-center text-[11px] font-extrabold"
              style={{
                borderColor: "rgba(15,23,42,0.12)",
                background: "rgba(31,111,235,0.10)",
                color: "rgba(15,23,42,0.85)",
              }}
              title={user?.email || "User"}
            >
              {initialsFrom(user)}
            </div>

            <div className="hidden sm:block min-w-0 text-left">
              <div className="text-[12px] font-semibold leading-tight truncate">{user?.displayName || "Admin"}</div>
              <div className="text-[11px] v-muted leading-tight truncate">{user?.email || "Signed out"}</div>
            </div>

            <span className="text-xs v-muted">▾</span>
          </button>

          {open && (
            <div
              className="absolute mt-2 right-4 top-[56px] w-[260px] v-card"
              style={{ padding: 10 }}
              role="menu"
            >
              <div className="px-2 py-2">
                <div className="text-[11px] v-muted">Signed in as</div>
                <div className="text-[13px] font-semibold truncate mt-1">{user?.email || "—"}</div>
              </div>

              <div
                className="my-2"
                style={{ height: 1, background: "rgba(15,23,42,0.08)" }}
              />

              <button className="w-full text-left v-btn" onClick={() => go("/settings")}>
                Settings
              </button>
              <button className="w-full text-left v-btn mt-2" onClick={() => go("/admin")}>
                Admin
              </button>
              <button className="w-full text-left v-btn mt-2" onClick={() => go("/applications")}>
                Applications
              </button>

              <div
                className="my-2"
                style={{ height: 1, background: "rgba(15,23,42,0.08)" }}
              />

              <button className="w-full text-left v-btn-primary" onClick={doSignOut}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
