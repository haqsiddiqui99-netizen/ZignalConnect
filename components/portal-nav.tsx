"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/portal", label: "My connection", exact: true },
  { href: "/portal/pay", label: "Pay bill" },
  { href: "/portal/history", label: "Receipts" },
  { href: "/portal/complaints", label: "Complaints" },
];

export function PortalNav() {
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
