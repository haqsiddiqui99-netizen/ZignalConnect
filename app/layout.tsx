import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { RichSelects } from "@/components/rich-selects";
import "./globals.css";

const googleVerification = process.env.GOOGLE_SITE_VERIFICATION?.trim();

export const metadata: Metadata = {
  metadataBase: new URL("https://www.zignalconnect.com"),
  title: { default: "Zignal Connect", template: "%s · Zignal Connect" },
  description: "Provider desk and subscriber portal for internet service providers.",
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
