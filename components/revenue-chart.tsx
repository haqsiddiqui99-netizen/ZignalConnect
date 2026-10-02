"use client";

import { useState } from "react";
import { formatInr } from "@/lib/format";

type RevenuePoint = { label: string; amount: number | null; expected?: boolean };

function axisTop(value: number) {
  const safe = Math.max(value, 1000);
  const pow = 10 ** Math.floor(Math.log10(safe));
  const scaled = safe / pow;
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return nice * pow;
}

function formatAxis(amount: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(amount);
}

export function RevenueChart({ points }: { points: RevenuePoint[] }) {
  const [mode, setMode] = useState<"bar" | "line">("bar");
  const max = axisTop(Math.max(0, ...points.map((point) => point.amount ?? 0)));
  const ticks = [max, max / 2, 0];
  const plot = (amount: number) => (amount / max) * 100;
  const coords = points.map((point, index) => {
    const amount = point.amount ?? 0;
    const x = ((index + 0.5) / points.length) * 100;
    const y = point.amount == null ? null : 100 - plot(amount);
    return { ...point, x, y };
  });
  const known = coords.filter((point) => point.y != null && !point.expected);
  const future = coords.find((point) => point.expected && point.y != null);
  const bridge = future && known.length > 0 ? [known[known.length - 1], future] : [];
  const line = (rows: { x: number; y: number | null }[]) => rows.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="chart-frame">
      <div className="chart-toolbar">
        <button type="button" className="btn small chart-switch" onClick={() => setMode(mode === "bar" ? "line" : "bar")}>
          {mode === "bar" ? "Line graph" : "Bar graph"}
        </button>
      </div>
      <div className="chart-with-axis">
        <div className="chart-y" aria-hidden="true">
          {ticks.map((tick, index) => (
            <span key={index}>{formatAxis(tick)}</span>
          ))}
        </div>
        <div className="chart-stage">
          {mode === "line" ? (
            <svg className="chart-svg" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Revenue line">
              <line x1="0" y1="0" x2="100" y2="0" className="chart-grid" vectorEffect="non-scaling-stroke" />
              <line x1="0" y1="50" x2="100" y2="50" className="chart-grid" vectorEffect="non-scaling-stroke" />
              <line x1="0" y1="100" x2="100" y2="100" className="chart-grid" vectorEffect="non-scaling-stroke" />
              {known.length > 1 ? (
                <polyline points={line(known)} fill="none" className="chart-stroke" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              ) : known.length === 1 && known[0].y != null ? (
                <line
                  x1={known[0].x - 1.5}
                  y1={known[0].y}
                  x2={known[0].x + 1.5}
                  y2={known[0].y}
                  className="chart-stroke"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              {bridge.length === 2 ? (
                <polyline
                  points={line(bridge)}
                  fill="none"
                  className="chart-stroke"
                  strokeWidth="2"
                  strokeDasharray="5 4"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
            </svg>
          ) : (
            <div className="chart" aria-label="Revenue bars">
              {points.map((point) => {
                const height = point.amount == null || point.amount === 0 ? 0 : Math.max(2, Math.round(plot(point.amount)));
                return (
                  <div className="chart-col" key={`${point.label}-${point.expected ? "next" : "past"}`}>
                    <div className="chart-bar-wrap">
                      <div className={point.expected ? "chart-bar expected" : "chart-bar"} style={{ height: `${height}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="chart-values">
            {points.map((point) => {
              const height = point.amount == null ? 0 : Math.round(plot(point.amount));
              const show = point.amount != null && point.amount > 0;
              return (
                <div className="chart-col" key={`${point.label}-${point.expected ? "next" : "past"}-value`}>
                  {show ? (
                    <span className="chart-value" style={{ bottom: `${height}%` }}>
                      {formatInr(point.amount ?? 0)}
                    </span>
                  ) : null}
                  {mode === "line" && point.amount != null ? (
                    <span className={point.expected ? "chart-dot expected" : "chart-dot"} style={{ bottom: `${height}%` }} />
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="chart-x">
            {points.map((point) => (
              <span key={`${point.label}-x`}>{point.label}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
