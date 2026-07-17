'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Applications', href: '/applications' },
  { label: 'Borrowers', href: '/borrowers' },
  { label: 'Underwriters', href: '/underwriters' },
  { label: 'Admin', href: '/admin' },
  { label: 'Settings', href: '/settings' },
];

export default function Sidebar() {
  const pathname = usePathname();
  return <aside className="w-64 border-r bg-white"><nav className="flex flex-col gap-1 p-4">{NAV_ITEMS.map(item => <Link key={item.href} href={item.href} className={`rounded px-3 py-2 text-sm font-medium ${pathname === item.href ? 'bg-black text-white' : 'text-gray-700 hover:bg-gray-100'}`}>{item.label}</Link>)}</nav></aside>;
}
