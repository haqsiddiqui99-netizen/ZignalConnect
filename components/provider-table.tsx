"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type ProviderRow = {
  id: number;
  isp: string;
  owner: string;
  place: string;
  plan: string;
  term: string;
  book: string;
  opened: string;
  openedSort: string;
  lastLogin: string;
  lastLoginSort: string;
  trial: string;
  trialSort: string;
  paymentDue: string;
  paymentDueSort: string;
  fee: string;
  staff: string;
  support: string;
  subscribers: string;
  active: string;
  paused: string;
  overdue: string;
  desk: string;
  stateKind: "open" | "closing" | "waiting" | "closed";
};

type ColumnKey = "isp" | "desk" | "plan" | "book" | "opened" | "lastLogin" | "trial" | "paymentDue" | "fee" | "staff" | "support" | "subscribers" | "active" | "paused" | "overdue";
type DateKey = "opened" | "lastLogin" | "trial" | "paymentDue";

const COLUMNS: { key: ColumnKey; label: string; numeric?: boolean; date?: boolean }[] = [
  { key: "isp", label: "ISP" },
  { key: "desk", label: "Desk" },
  { key: "plan", label: "Plan" },
  { key: "book", label: "Book size", numeric: true },
  { key: "opened", label: "Opened", date: true },
  { key: "lastLogin", label: "Last login", date: true },
  { key: "trial", label: "Trial end", date: true },
  { key: "paymentDue", label: "Payment due date", date: true },
  { key: "fee", label: "Monthly fee", numeric: true },
  { key: "staff", label: "Staff", numeric: true },
  { key: "support", label: "Support" },
  { key: "subscribers", label: "Subscribers", numeric: true },
  { key: "active", label: "Active", numeric: true },
  { key: "paused", label: "Paused", numeric: true },
  { key: "overdue", label: "Overdue", numeric: true },
];

const SORT_FIELD: Record<DateKey, "openedSort" | "lastLoginSort" | "trialSort" | "paymentDueSort"> = {
  opened: "openedSort",
  lastLogin: "lastLoginSort",
  trial: "trialSort",
  paymentDue: "paymentDueSort",
};

function stampValue(stamp: string) {
  if (!stamp.trim()) return null;
  const [date, time = "00:00:00"] = stamp.trim().split(" ");
  const [y, m, d] = date.split("-").map(Number);
  const [hh = 0, mi = 0, ss = 0] = time.split(":").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, hh, mi, ss).getTime();
}

function FilterMenu({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: string;
  choices: string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [box, setBox] = useState({ top: 0, left: 0 });
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const visible = choices.filter((choice) => choice.toLowerCase().includes(query.trim().toLowerCase()));

  function place(anchor: HTMLElement) {
    const rect = anchor.getBoundingClientRect();
    const width = 280;
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    setBox({ top: rect.bottom + 8, left });
  }

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  return (
    <div className={`desk-filter${value ? " on" : ""}`} ref={root}>
      <button
        type="button"
        className="desk-filter-btn"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={value ? `${label} filter, ${value}` : `Filter ${label}`}
        onClick={(event) => {
          place(event.currentTarget);
          setQuery("");
          setOpen((current) => !current);
        }}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M1.2 2.2h13.6L9.4 8.1v5.1l-2.8-1.3V8.1L1.2 2.2z" />
        </svg>
      </button>
      {open ? (
        <div className="desk-menu" id={listId} role="listbox" aria-label={label} style={{ position: "fixed", top: box.top, left: box.left }}>
          {choices.length > 6 ? (
            <input
              className="desk-menu-find"
              value={query}
              placeholder="Find"
              aria-label={`Find in ${label}`}
              onChange={(event) => setQuery(event.target.value)}
            />
          ) : null}
          <button
            type="button"
            role="option"
            aria-selected={!value}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            <span className="tick">{value ? "" : "✓"}</span>
            All
          </button>
          {visible.map((choice) => (
            <button
              key={choice}
              type="button"
              role="option"
              aria-selected={value === choice}
              title={choice}
              onClick={() => {
                onChange(choice);
                setOpen(false);
              }}
            >
              <span className="tick">{value === choice ? "✓" : ""}</span>
              <span className="desk-menu-label">{choice}</span>
            </button>
          ))}
          {visible.length === 0 ? <p className="fine">Nothing matches.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function ProviderTable({ rows }: { rows: ProviderRow[] }) {
  const [filters, setFilters] = useState<Partial<Record<ColumnKey, string>>>({});
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: DateKey; dir: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(1);
  const choices = useMemo(() => {
    const lists = {} as Record<string, string[]>;
    for (const column of COLUMNS) {
      lists[column.key] = [...new Set(rows.map((row) => row[column.key]))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }
    return lists;
  }, [rows]);

  const shown = rows
    .filter((row) => {
      const needle = search.trim().toLowerCase();
      if (!needle) return true;
      return [row.isp, row.owner, row.place, row.plan, row.support, row.desk].some((value) => value.toLowerCase().includes(needle));
    })
    .filter((row) => COLUMNS.every((column) => !filters[column.key] || row[column.key] === filters[column.key]))
    .sort((a, b) => {
      if (!sort) return a.isp.localeCompare(b.isp);
      const left = stampValue(a[SORT_FIELD[sort.key]]);
      const right = stampValue(b[SORT_FIELD[sort.key]]);
      if (left == null && right == null) return a.isp.localeCompare(b.isp);
      if (left == null) return 1;
      if (right == null) return -1;
      const delta = sort.dir === "asc" ? left - right : right - left;
      return delta || a.isp.localeCompare(b.isp);
    });

  const active = COLUMNS.filter((column) => filters[column.key]);
  const pageSize = 8;
  const pages = Math.max(1, Math.ceil(shown.length / pageSize));
  const current = Math.min(page, pages);
  const visible = shown.slice((current - 1) * pageSize, current * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, filters, sort]);

  function toggleSort(key: DateKey) {
    setSort((current) => {
      if (!current || current.key !== key) return { key, dir: "desc" };
      if (current.dir === "desc") return { key, dir: "asc" };
      return null;
    });
  }

  function clearAll() {
    setFilters({});
    setSearch("");
    setSort(null);
  }

  return (
    <div className="desk-board">
      <div className="desk-bar">
        <label className="desk-search">
          <input aria-label="Search" value={search} placeholder="ISP, owner, or city" onChange={(event) => setSearch(event.target.value)} />
        </label>
        <p>
          <b>{shown.length}</b>
          <span>{shown.length === 1 ? "desk" : "desks"}</span>
        </p>
        {search || active.length || sort ? (
          <button type="button" className="btn small" onClick={clearAll}>
            Clear
          </button>
        ) : null}
      </div>
      {active.length || sort ? (
        <div className="desk-chips">
          {active.map((column) => (
            <span key={column.key} className="desk-chip">
              {column.label}: {filters[column.key]}
              <button type="button" aria-label={`Remove ${column.label} filter`} onClick={() => setFilters((current) => ({ ...current, [column.key]: "" }))}>
                ×
              </button>
            </span>
          ))}
          {sort ? (
            <span className="desk-chip">
              {COLUMNS.find((column) => column.key === sort.key)?.label} · {sort.dir === "desc" ? "newest first" : "oldest first"}
              <button type="button" aria-label="Remove sort" onClick={() => setSort(null)}>
                ×
              </button>
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="table-wrap">
        <table className="provider-table">
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th key={column.key} className={column.numeric ? "num" : undefined} aria-sort={sort?.key === column.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                  <div className="desk-head">
                    {column.date ? (
                      <button type="button" className={`desk-sort${sort?.key === column.key ? " on" : ""}`} onClick={() => toggleSort(column.key as DateKey)}>
                        {column.label}
                        <i aria-hidden="true">{sort?.key === column.key ? (sort.dir === "desc" ? "↓" : "↑") : "↕"}</i>
                      </button>
                    ) : (
                      <span>{column.label}</span>
                    )}
                    <FilterMenu
                        label={column.label}
                        value={filters[column.key] ?? ""}
                        choices={choices[column.key] ?? []}
                        onChange={(value) => setFilters((current) => ({ ...current, [column.key]: value }))}
                      />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td className="desk-empty" colSpan={COLUMNS.length}>
                  No desks match this view.
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr key={row.id}>
                  <td className="isp">
                    <div className="desk-isp">{row.isp}</div>
                    {row.owner ? <div className="fine">{row.owner}</div> : null}
                    {row.place ? <div className="fine">{row.place}</div> : null}
                  </td>
                  <td>
                    <span className={`desk-state ${row.stateKind}`}>{row.desk}</span>
                  </td>
                  <td>
                    <span className="desk-plan">{row.plan}</span>
                    <div className="fine">{row.term}</div>
                  </td>
                  <td className="num">{row.book}</td>
                  <td className="desk-time">{row.opened}</td>
                  <td className={row.lastLogin === "Not yet" ? "desk-quiet" : "desk-time"}>{row.lastLogin}</td>
                  <td className="desk-time">{row.trial}</td>
                  <td className="desk-time">{row.paymentDue}</td>
                  <td className="num">{row.fee}</td>
                  <td className="num">{row.staff}</td>
                  <td>{row.support}</td>
                  <td className="num">{row.subscribers}</td>
                  <td className="num">{row.active}</td>
                  <td className="num">{row.paused}</td>
                  <td className={Number(row.overdue) > 0 ? "num desk-hot" : "num"}>{row.overdue}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <button type="button" className="btn" disabled={current <= 1} onClick={() => setPage(current - 1)}>
          Previous page
        </button>
        <span className="fine">
          Page {current} of {pages}
        </span>
        <button type="button" className="btn" disabled={current >= pages} onClick={() => setPage(current + 1)}>
          Next page
        </button>
      </div>
    </div>
  );
}
