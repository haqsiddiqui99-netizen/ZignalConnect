import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Zignal Connect", template: "%s · Zignal Connect" },
  description: "Provider desk and subscriber portal for internet service providers.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const theme = session?.theme === "dark" ? "dark" : "light";
  return (
    <html lang="en" data-theme={theme}>
      <body>{children}</body>
    </html>
  );
}
