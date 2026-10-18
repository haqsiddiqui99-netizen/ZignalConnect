"use client";

import Link from "next/link";
import { useRef, useState } from "react";

const VIDEOS = [
  { id: "en", label: "English", src: "/demo/zignal-connect-promo-en.mp4" },
  { id: "hi", label: "हिन्दी", src: "/demo/zignal-connect-promo-hi.mp4" },
] as const;

type Lang = (typeof VIDEOS)[number]["id"];

export function DemoVideo({ variant = "nav" }: { variant?: "nav" | "hero" }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const video = VIDEOS.find((item) => item.id === lang) ?? VIDEOS[0];

  return (
    <>
      <button
        type="button"
        className={`demo-open ${variant}`}
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="11" fill="currentColor" opacity="0.14" />
          <path d="M9.5 7.6v8.8a.6.6 0 0 0 .9.5l7-4.4a.6.6 0 0 0 0-1l-7-4.4a.6.6 0 0 0-.9.5Z" fill="currentColor" />
        </svg>
        {variant === "hero" ? "Watch the 90-second demo" : "Watch demo"}
      </button>
      <dialog
        ref={dialog}
        className="demo-dialog"
        aria-label="Zignal Connect demo"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
      >
        {open ? (
          <div className="demo-sheet">
            <div className="demo-head">
              <div>
                <p className="eyebrow">Demo</p>
                <h2>See Zignal Connect in about 90 seconds</h2>
              </div>
              <button type="button" className="btn small" onClick={() => dialog.current?.close()}>
                Close
              </button>
            </div>
            <div className="demo-tabs" role="group" aria-label="Language">
              {VIDEOS.map((item) => (
                <button key={item.id} type="button" aria-pressed={item.id === lang} onClick={() => setLang(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
            <video key={video.id} className="demo-video" src={video.src} controls autoPlay playsInline preload="auto" />
            <div className="demo-foot">
              <span>Like what you see? Your first 30 days are free.</span>
              <Link className="btn primary small" href="/signup">
                Open a desk
              </Link>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
