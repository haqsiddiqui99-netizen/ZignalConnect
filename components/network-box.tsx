"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";

type Kind = "" | "mikrotik" | "radius";

export function NetworkBoxFields({
  action,
  kind,
  host,
  port,
  user,
  hasSecret,
  database,
  hasCoa,
}: {
  action: (formData: FormData) => void | Promise<void>;
  kind: string;
  host: string;
  port: number;
  user: string;
  hasSecret: boolean;
  database: string;
  hasCoa: boolean;
}) {
  const initial: Kind = kind === "mikrotik" || kind === "radius" ? kind : "";
  const [chosen, setChosen] = useState<Kind>(initial);
  const [portValue, setPortValue] = useState(port ? String(port) : "");

  function choose(next: Kind) {
    setChosen(next);
    setPortValue((current) => {
      if (next === "mikrotik" && (current === "" || current === "3306")) return "";
      if (next === "radius" && (current === "" || current === "8728")) return "";
      return current;
    });
  }

  const connection = (
    <label className="field">
      <span>Connection</span>
      <select name="line_kind" value={chosen} onChange={(event) => choose(event.target.value as Kind)}>
        <option value="">Not connected</option>
        <option value="mikrotik">MikroTik</option>
        <option value="radius">RADIUS</option>
      </select>
    </label>
  );

  return (
    <form action={action} className="stack">
      {chosen ? (
        <>
          <div className="network-line">
            {connection}
            <label className="field">
              <span>Address</span>
              <input
                name="line_host"
                defaultValue={host}
                autoComplete="off"
                placeholder={chosen === "mikrotik" ? "192.168.1.1" : "radius.example.com"}
              />
            </label>
            <label className="field">
              <span>Port</span>
              <input
                name="line_port"
                inputMode="numeric"
                value={portValue}
                onChange={(event) => setPortValue(event.target.value)}
                placeholder={chosen === "mikrotik" ? "8728" : "3306"}
              />
            </label>
          </div>
          <div className="network-pair">
            <label className="field">
              <span>Login name</span>
              <input name="line_user" defaultValue={user} autoComplete="off" />
            </label>
            <label className="field">
              <span>Password</span>
              <input name="line_secret" type="password" autoComplete="new-password" placeholder={hasSecret ? "Saved. Leave blank to keep it." : ""} />
            </label>
          </div>
          {chosen === "radius" ? (
            <div className="network-pair">
              <label className="field">
                <span>Database name</span>
                <input name="line_db" defaultValue={database} autoComplete="off" />
              </label>
              <label className="field">
                <span>Disconnect secret</span>
                <input name="line_coa" type="password" autoComplete="new-password" placeholder={hasCoa ? "Saved. Leave blank to keep it." : ""} />
              </label>
            </div>
          ) : null}
          <p className="fine">
            {chosen === "radius"
              ? "Leave a password blank to keep the saved one. The disconnect secret is optional."
              : "Leave a password blank to keep the saved one."}
          </p>
        </>
      ) : (
        <>
          {connection}
          <p className="fine">The desk still saves line status. The network line does not change.</p>
        </>
      )}
      <SubmitButton className="btn small">Save network box</SubmitButton>
    </form>
  );
}
