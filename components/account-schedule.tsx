"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BILL_CYCLES, billCycleAdvance, renewalAfterInstallation } from "@/lib/bill-cycle";

export function AccountSchedule({
  cycle,
  installation,
  renewal,
  children,
}: {
  cycle: string;
  installation: string;
  renewal: string;
  children?: ReactNode;
}) {
  const [billCycle, setBillCycle] = useState(cycle);
  const [installed, setInstalled] = useState(installation);
  const [renews, setRenews] = useState(renewal);
  const previous = useRef({ installed: installation, billCycle: cycle });

  useEffect(() => {
    if (previous.current.installed === installed && previous.current.billCycle === billCycle) return;
    previous.current = { installed, billCycle };
    setRenews(renewalAfterInstallation(installed, billCycle));
  }, [installed, billCycle]);

  return (
    <>
      <div className={children ? "account-meta" : "row-2"}>
        {children}
        <label className="field">
          <span>
            Bill cycle <i className="req" aria-hidden="true">*</i>
          </span>
          <select name="bill_cycle" required value={billCycle} onChange={(event) => setBillCycle(event.target.value)}>
            {BILL_CYCLES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {children ? (
        <p className="fine">
          Goods and Services Tax (GST) at a standard rate of 18% is charged on all internet, mobile data, and broadband
          telecom services in India.
        </p>
      ) : null}
      <div className="row-2">
        <label className="field">
          <span>
            Installation date <i className="req" aria-hidden="true">*</i>
          </span>
          <input type="date" name="installation_date" required value={installed} onChange={(event) => setInstalled(event.target.value)} />
        </label>
        <label className="field">
          <span>Renewal date</span>
          <input type="date" value={renews} disabled />
          <input type="hidden" name="renew_date" value={renews} />
          <small className="fine">
            {billCycleAdvance(billCycle).replace(/^./, (letter) => letter.toUpperCase())} after the installation date.
          </small>
        </label>
      </div>
    </>
  );
}
