"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type FormEvent, type MouseEvent, type ReactNode } from "react";

type Shot = { x: number; y: number; rows: number[] };

let pending: Shot | null = null;

function capture(): Shot {
  const rows = Array.from(document.querySelectorAll<HTMLElement>(".table-wrap")).map((node) => node.scrollLeft);
  return { x: window.scrollX, y: window.scrollY, rows };
}

function place(shot: Shot) {
  if (window.scrollX !== shot.x || window.scrollY !== shot.y) window.scrollTo(shot.x, shot.y);
  document.querySelectorAll<HTMLElement>(".table-wrap").forEach((node, index) => {
    const left = shot.rows[index];
    if (left != null && node.scrollLeft !== left) node.scrollLeft = left;
  });
}

function moved(shot: Shot) {
  if (window.scrollX !== shot.x || window.scrollY !== shot.y) return true;
  const nodes = document.querySelectorAll<HTMLElement>(".table-wrap");
  for (let index = 0; index < shot.rows.length; index += 1) {
    const node = nodes[index];
    if (node && node.scrollLeft !== shot.rows[index]) return true;
  }
  return false;
}

function hold(shot: Shot) {
  let frames = 0;
  let steady = 0;
  const tick = () => {
    if (pending !== shot) return;
    if (moved(shot)) {
      place(shot);
      steady = 0;
    } else {
      steady += 1;
    }
    frames += 1;
    if (frames < 180 && (frames < 60 || steady < 12)) requestAnimationFrame(tick);
    else if (pending === shot) pending = null;
  };
  requestAnimationFrame(tick);
}

function keepPlace() {
  const shot = capture();
  pending = shot;
  hold(shot);
}

export function FilterForm({
  action,
  className,
  children,
}: {
  action?: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!pending) return;
    hold(pending);
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    for (const [key, value] of data.entries()) {
      if (typeof value === "string" && value.trim() !== "") params.append(key, value);
    }
    const path = action || window.location.pathname;
    const query = params.toString();
    keepPlace();
    router.push(query ? `${path}?${query}` : path, { scroll: false });
  }

  return (
    <form className={className} action={action} method="get" onSubmit={onSubmit}>
      {children}
    </form>
  );
}

export function FilterLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    keepPlace();
    router.push(href, { scroll: false });
  }

  return (
    <Link href={href} className={className} scroll={false} onClick={onClick}>
      {children}
    </Link>
  );
}
