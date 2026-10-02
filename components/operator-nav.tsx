"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/zignal", label: "Providers", exact: true },
  { href: "/zignal/revenue", label: "Revenue" },
  { href: "/zignal/support", label: "Support" },
  { href: "/zignal/settings", label: "Settings" },
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
