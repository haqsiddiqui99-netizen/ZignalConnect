"use client";

import { TAX_PRESETS } from "@/lib/charges";

const PRESET_VALUES = new Set<string>(TAX_PRESETS.map(String));

export function TaxMode({
  label,
  name,
  percentName,
  mode,
  custom,
  onMode,
  onCustom,
  includedRate,
}: {
  label: string;
  name: string;
  percentName: string;
  mode: string;
  custom: string;
  onMode: (mode: string) => void;
  onCustom: (value: string) => void;
  includedRate?: number;
}) {
  const locked = mode !== "custom";
  const shown =
    mode === "custom"
      ? custom
      : PRESET_VALUES.has(mode)
        ? mode
        : mode === "included" && includedRate
          ? String(includedRate)
          : "";

  function choose(value: string) {
    onMode(value);
    if (PRESET_VALUES.has(value)) onCustom(value);
    else if (value === "included") onCustom(includedRate ? String(includedRate) : "");
    else onCustom(custom);
  }

  return (
    <>
      <label className="field">
        <span>{label}</span>
        <select name={name} value={mode} onChange={(event) => choose(event.target.value)}>
          <option value="included">Tax included</option>
          {TAX_PRESETS.map((percent) => (
            <option key={percent} value={String(percent)}>
              Add {percent}%
            </option>
          ))}
          <option value="custom">Other %</option>
        </select>
      </label>
      <label className="field">
        <span>Tax percent</span>
        <input
          name={percentName}
          type="number"
          min={1}
          max={100}
          step={1}
          readOnly={locked}
          required={!locked}
          className={locked ? "tax-locked" : undefined}
          value={shown}
          placeholder={locked ? "" : "18"}
          onChange={(event) => onCustom(event.target.value)}
        />
      </label>
    </>
  );
}
