"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items: { href: string; label: string; exact?: boolean; also?: string[] }[] = [
  { href: "/provider", label: "Overview", exact: true },
  { href: "/provider/subscriber", label: "Subscribers", also: ["/provider/import", "/provider/payments"] },
  { href: "/provider/plans", label: "Catalogue" },
  { href: "/provider/revenue", label: "Revenue" },
  { href: "/provider/reports", label: "Report" },
  { href: "/provider/team", label: "My team" },
  { href: "/provider/upgrade", label: "Upgrade" },
  { href: "/provider/complaints", label: "Complaint" },
  { href: "/provider/settings", label: "Settings" },
  { href: "/provider/support", label: "Zignal Support" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="side-nav">
      {items.map((item) => {
        const active = item.exact
          ? path === item.href
          : path.startsWith(item.href) || item.also?.some((prefix) => path.startsWith(prefix));
        return (
          <Link key={item.href} href={item.href} className={active ? "active" : undefined}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
