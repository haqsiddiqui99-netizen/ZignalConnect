import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { RichSelects } from "@/components/rich-selects";
import "./globals.css";

const googleVerification = process.env.GOOGLE_SITE_VERIFICATION?.trim();

export const metadata: Metadata = {
  metadataBase: new URL("https://www.zignalconnect.com"),
  title: { default: "Zignal Connect | ISP Billing Desk and Subscriber Portal", template: "%s · Zignal Connect" },
  description:
    "Run your ISP from one desk: subscribers, renewals, payments and receipts, complaints, and a subscriber portal with your own name. 30-day free trial.",
  applicationName: "Zignal Connect",
  openGraph: { siteName: "Zignal Connect", type: "website", url: "/" },
  ...(googleVerification ? { verification: { google: googleVerification } } : {}),
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const theme = session?.theme === "dark" ? "dark" : "light";
  return (
    <html lang="en" data-theme={theme}>
      <body>
        {children}
        <RichSelects />
      </body>
    </html>
  );
}
