import type { Metadata } from "next";
import { Sidebar } from "@/components/sidebar";
import { AppLayout } from "@/components/app-layout";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tweet Pipeline",
  description: "Scrape trending tweets, rewrite with character voice, output for posting",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 antialiased">
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <AppLayout>{children}</AppLayout>
        </div>
      </body>
    </html>
  );
}
