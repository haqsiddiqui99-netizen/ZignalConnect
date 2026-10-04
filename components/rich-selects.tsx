"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Menu = { select: HTMLSelectElement; active: number };

function place(select: HTMLSelectElement) {
  const rect = select.getBoundingClientRect();
  const gap = 6;
  const below = window.innerHeight - rect.bottom - gap - 8;
  const above = rect.top - gap - 8;
  const openUp = below < 200 && above > below;
  const maxHeight = Math.max(140, Math.min(320, openUp ? above : below));
  const width = Math.min(Math.max(rect.width, 180), window.innerWidth - 16);
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  return openUp
    ? { left, width, maxHeight, top: undefined, bottom: window.innerHeight - rect.top + gap }
    : { left, width, maxHeight, top: rect.bottom + gap, bottom: undefined };
}

export function RichSelects() {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [tick, setTick] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const openRef = useRef<(select: HTMLSelectElement) => void>(() => {});

  openRef.current = (select) => {
    if (select.disabled || select.options.length === 0) return;
    setMenu((current) => (current?.select === select ? null : { select, active: Math.max(0, select.selectedIndex) }));
  };

  useEffect(() => {
    const bound = new WeakSet<HTMLSelectElement>();
    function bind(select: HTMLSelectElement) {
      if (bound.has(select) || select.multiple) return;
      bound.add(select);
      let fromPointer = false;
      select.addEventListener("mousedown", (event) => {
        if (select.disabled) return;
        event.preventDefault();
        event.stopPropagation();
        fromPointer = true;
        select.focus();
        openRef.current(select);
      });
      select.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (fromPointer) {
          fromPointer = false;
          return;
        }
        openRef.current(select);
      });
      select.addEventListener("keydown", (event) => {
        if (select.disabled) return;
        if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          openRef.current(select);
        }
      });
    }
    function scan(root: ParentNode) {
      root.querySelectorAll("select").forEach((node) => {
        if (node instanceof HTMLSelectElement) bind(node);
      });
    }
    scan(document);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLSelectElement) bind(node);
          else if (node instanceof HTMLElement) scan(node);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!menu) return;
    const node = menu.select;
    node.setAttribute("aria-expanded", "true");
    const move = (event: Event) => {
      if (!node.isConnected) {
        setMenu(null);
        return;
      }
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      setTick((value) => value + 1);
    };
    const outside = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target) || node.contains(target)) return;
      setMenu(null);
    };
    window.addEventListener("scroll", move, true);
    window.addEventListener("resize", move);
    document.addEventListener("mousedown", outside);
    return () => {
      node.setAttribute("aria-expanded", "false");
      window.removeEventListener("scroll", move, true);
      window.removeEventListener("resize", move);
      document.removeEventListener("mousedown", outside);
    };
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    menuRef.current?.focus();
  }, [menu?.select]);
  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>("[data-active='true']")?.scrollIntoView({ block: "nearest" });
  }, [menu?.active, menu?.select]);

  function choose(index: number) {
    if (!menu) return;
    const option = menu.select.options[index];
    if (!option || option.disabled) return;
    menu.select.selectedIndex = index;
    menu.select.dispatchEvent(new Event("input", { bubbles: true }));
    menu.select.dispatchEvent(new Event("change", { bubbles: true }));
    menu.select.focus();
    setMenu(null);
  }

  function moveActive(step: number) {
    setMenu((current) => {
      if (!current) return current;
      const options = current.select.options;
      let next = current.active;
      for (let i = 0; i < options.length; i += 1) {
        next = (next + step + options.length) % options.length;
        if (!options[next].disabled) return { ...current, active: next };
      }
      return current;
    });
  }

  if (!menu || !menu.select.isConnected) return null;
  const box = place(menu.select);
  void tick;
  const options = [...menu.select.options];

  return createPortal(
    <div
      ref={menuRef}
      className="rich-menu"
      role="listbox"
      tabIndex={-1}
      style={{ left: box.left, width: box.width, maxHeight: box.maxHeight, top: box.top, bottom: box.bottom }}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveActive(1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          moveActive(-1);
        } else if (event.key === "Home") {
          event.preventDefault();
          setMenu((current) => (current ? { ...current, active: 0 } : current));
        } else if (event.key === "End") {
          event.preventDefault();
          setMenu((current) => (current ? { ...current, active: current.select.options.length - 1 } : current));
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          choose(menu.active);
        } else if (event.key === "Escape" || event.key === "Tab") {
          event.preventDefault();
          menu.select.focus();
          setMenu(null);
        } else if (event.key.length === 1) {
          const query = event.key.toLowerCase();
          const found = options.findIndex((option, index) => index > menu.active && option.text.toLowerCase().startsWith(query));
          const earlier = options.findIndex((option) => option.text.toLowerCase().startsWith(query));
          const next = found >= 0 ? found : earlier;
          if (next >= 0) setMenu((current) => (current ? { ...current, active: next } : current));
        }
      }}
    >
      {options.map((option, index) => (
        <button
          key={`${option.value}-${index}`}
          type="button"
          role="option"
          disabled={option.disabled}
          aria-selected={index === menu.select.selectedIndex}
          data-active={index === menu.active ? "true" : undefined}
          className={index === menu.active ? "active" : undefined}
          onMouseEnter={() => setMenu((current) => (current ? { ...current, active: index } : current))}
          onClick={() => choose(index)}
        >
          <span>{option.text}</span>
          <span className="tick">{index === menu.select.selectedIndex ? "✓" : ""}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
