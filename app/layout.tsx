import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Zignal Connect", template: "%s · Zignal Connect" },
  description: "Provider desk and subscriber portal for internet service providers.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
