"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/operator", label: "Providers", exact: true },
  { href: "/operator/revenue", label: "Revenue" },
  { href: "/operator/support", label: "Support" },
  { href: "/operator/settings", label: "Settings" },
];

export function OperatorNav() {
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
