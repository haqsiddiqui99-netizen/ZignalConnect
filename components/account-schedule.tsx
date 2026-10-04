"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BILL_CYCLES, renewalAfterInstallation } from "@/lib/bill-cycle";

export function AccountSchedule({
  cycle,
  reminders,
  installation,
  renewal,
  children,
}: {
  cycle: string;
  reminders: string;
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
          <span>Bill cycle</span>
          <select name="bill_cycle" value={billCycle} onChange={(event) => setBillCycle(event.target.value)}>
            {BILL_CYCLES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Payment reminders</span>
          <select name="reminders" defaultValue={reminders}>
            <option value="on">Send reminders</option>
            <option value="off">Do not send reminders</option>
          </select>
        </label>
      </div>
      <div className="row-2">
        <label className="field">
          <span>Installation date</span>
          <input type="date" name="installation_date" required value={installed} onChange={(event) => setInstalled(event.target.value)} />
        </label>
        <label className="field">
          <span>Renewal date</span>
          <input type="date" name="renew_date" required value={renews} onChange={(event) => setRenews(event.target.value)} />
        </label>
      </div>
    </>
  );
}
