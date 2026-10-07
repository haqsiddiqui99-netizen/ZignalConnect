"use client";

import { type ReactNode, useState } from "react";
import { BILL_CYCLES, billCycleAdvance, renewalAfterInstallation } from "@/lib/bill-cycle";

export function PlanTerm({
  frequency,
  activated,
  amount,
  children,
}: {
  frequency: string;
  activated: string;
  amount: ReactNode;
  children?: ReactNode;
}) {
  const [cycle, setCycle] = useState(frequency || "monthly");
  const [installed, setInstalled] = useState(activated);
  const renews = installed ? renewalAfterInstallation(installed, cycle) : "";
  const advance = billCycleAdvance(cycle);
  const hint = `${advance.charAt(0).toUpperCase()}${advance.slice(1)} after the activation date.`;

  return (
    <>
      <div className="row-2">
        <label className="field">
          <span>Frequency</span>
          <select name="frequency" value={cycle} onChange={(event) => setCycle(event.target.value)}>
            {BILL_CYCLES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {amount}
      </div>
      {children}
      <div className="row-2">
        <label className="field">
          <span>Activation date</span>
          <input name="activated_on" type="date" required value={installed} onChange={(event) => setInstalled(event.target.value)} />
        </label>
        <label className="field">
          <span>Renewal date</span>
          <input type="date" value={renews} disabled />
          <input type="hidden" name="renews_on" value={renews} />
          <small className="fine">{hint}</small>
        </label>
      </div>
    </>
  );
}
