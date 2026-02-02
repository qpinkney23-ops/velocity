"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { label: "Dashboard", href: "/dashboard", icon: "▦" },
  { label: "Applications", href: "/applications", icon: "▤" },
  { label: "Borrowers", href: "/borrowers", icon: "👥" },
  { label: "Underwriters", href: "/underwriters", icon: "🛡" },
  { label: "Admin", href: "/admin", icon: "⚙" },
  { label: "Settings", href: "/settings", icon: "☰" },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="v-sidebar w-[260px] hidden md:flex flex-col min-h-screen">
      <div className="p-4">
        <div className="v-sidebar-brand">
          <div className="flex items-center gap-3">
            <div className="v-logo">
              <span className="v-logo-text">V</span>
            </div>

            <div className="min-w-0">
              <div className="v-wordmark truncate">Velocity</div>
              <div className="v-submark truncate">Loan Workflow Platform</div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <span className="v-pill">V1 Workflow</span>
            <span className="v-pill v-pill-muted">AI Scan (Phase 2)</span>
          </div>
        </div>
      </div>

      <div className="px-3">
        <div className="text-[11px] tracking-wide text-white/45 px-2 mb-2">WORKSPACE</div>

        <nav className="space-y-1">
          {nav.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={["v-nav-item", active ? "v-nav-item-active" : ""].join(" ")}
              >
                <span className="v-nav-icon">{item.icon}</span>
                <span className="truncate">{item.label}</span>
                {active ? <span className="v-nav-dot" /> : null}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto p-4">
        <div className="v-sidebar-tip">
          <div className="text-[11px] text-white/70 font-semibold">Tip</div>
          <div className="text-[11px] text-white/55 mt-1 leading-relaxed">
            Demo flow: Applications → View → Status → Notes → Assign UW → Upload → AI Scan
          </div>
        </div>
      </div>
    </aside>
  );
}
