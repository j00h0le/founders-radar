import type { Metadata } from "next";
import { IBM_Plex_Sans_KR } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { RadarProvider } from "@/components/radar-provider";
import { Toaster } from "@/components/ui/toast";
import { getDataMode } from "@/lib/db/mode";
import "./globals.css";

const plex = IBM_Plex_Sans_KR({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Startup Radar",
  description:
    "A personalized way for founders in South Korea to find startup events, networking, competitions, and programs.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const mode = getDataMode();
  return (
    <html lang="en" className={`${plex.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <RadarProvider mode={mode}>
          <AppShell mode={mode}>{children}</AppShell>
          <Toaster />
        </RadarProvider>
      </body>
    </html>
  );
}
