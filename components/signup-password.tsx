"use client";

import { useState } from "react";

const RULES = [
  { key: "length", label: "At least 8 characters", test: (password: string) => password.length >= 8 },
  { key: "lower", label: "lower letter", test: (password: string) => /[a-z]/.test(password) },
  { key: "upper", label: "upper letter", test: (password: string) => /[A-Z]/.test(password) },
  { key: "number", label: "number", test: (password: string) => /\d/.test(password) },
  { key: "symbol", label: "special character", test: (password: string) => /[^A-Za-z0-9]/.test(password) },
] as const;

function strengthOf(password: string) {
  const kinds = RULES.filter((rule) => rule.key !== "length" && rule.test(password)).length;
  if (password.length < 8 || kinds < 2) return { label: "Weak", tone: "weak" };
  if (kinds < 4) return { label: "Fair", tone: "fair" };
  return { label: "Strong", tone: "strong" };
}

export function SignupPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const strength = strengthOf(password);
  const lengthWord = password.length === 1 ? "1 character" : `${password.length} characters`;
  const lengthStatus = password.length >= 8 ? "Long enough" : "Too short";
  const matches = confirm.length > 0 && password === confirm;

  return (
    <div className="signup-fields">
      <div className="field">
        <span>Password</span>
        <div className="password-box">
          <input
            name="password"
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (!event.target.value) setVisible(false);
            }}
          />
          {password.length > 0 ? (
          <button
            type="button"
            className="password-eye"
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            onClick={() => setVisible((current) => !current)}
          >
            {visible ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 3l18 18" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path d="M9.9 9.9A3.2 3.2 0 0 0 12 15.2 3.2 3.2 0 0 0 14.1 14" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path d="M6.1 6.4C4.2 7.7 2.8 9.6 2 12c1.6 4.2 5.4 7 10 7 1.7 0 3.3-.4 4.7-1.1M10 5.1A10 10 0 0 1 12 5c4.6 0 8.4 2.8 10 7a12 12 0 0 1-2.2 3.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M2 12c1.6-4.2 5.4-7 10-7s8.4 2.8 10 7c-1.6 4.2-5.4 7-10 7s-8.4-2.8-10-7z" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            )}
          </button>
          ) : null}
        </div>
        <p className="fine password-status">
          {lengthWord} : <strong className={password.length >= 8 ? "strong" : "weak"}>{lengthStatus}</strong>, Strength:{" "}
          <strong className={strength.tone}>{strength.label}</strong>
        </p>
        <p className="password-rules">
          {RULES.map((rule) => (
            <span key={rule.key} className={rule.test(password) ? "met" : undefined}>
              {rule.label}
            </span>
          ))}
        </p>
      </div>
      <label className="field">
        <span>Confirm password</span>
        <input
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
        {matches ? <p className="fine password-match">Password matches</p> : null}
      </label>
    </div>
  );
}
