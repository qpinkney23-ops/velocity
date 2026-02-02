'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Role = 'admin' | 'underwriter' | 'loan_officer';

const NAV_ITEMS: Record<Role, { label: string; href: string }[]> = {
  admin: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Applications', href: '/applications' },
    { label: 'Borrowers', href: '/borrowers' },
    { label: 'Underwriters', href: '/underwriters' },
    { label: 'Admin', href: '/admin' },
    { label: 'Settings', href: '/settings' },
  ],
  underwriter: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Applications', href: '/applications' },
    { label: 'Borrowers', href: '/borrowers' },
  ],
  loan_officer: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Applications', href: '/applications' },
  ],
};

export default function Sidebar() {
  const pathname = usePathname();

  // TEMP: hardcoded role until auth wiring
  const role: Role = 'admin';

  return (
    <aside className="w-64 border-r bg-white">
      <nav className="flex flex-col gap-1 p-4">
        {NAV_ITEMS[role].map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded px-3 py-2 text-sm font-medium ${
              pathname === item.href
                ? 'bg-black text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
