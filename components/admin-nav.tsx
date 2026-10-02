"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/provider", label: "Overview", exact: true },
  { href: "/provider/subscriber", label: "Subscribers" },
  { href: "/provider/import", label: "Import" },
  { href: "/provider/plans", label: "Plans" },
  { href: "/provider/revenue", label: "Revenue" },
  { href: "/provider/complaints", label: "Complaints" },
  { href: "/provider/reports", label: "Reports" },
  { href: "/provider/team", label: "Team" },
  { href: "/provider/support", label: "Zignal support" },
  { href: "/provider/upgrade", label: "Upgrade" },
  { href: "/provider/settings", label: "Settings" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="side-nav">
      {items.map((item) => {
        const active = item.exact ? path === item.href : path.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} className={active ? "active" : undefined}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
