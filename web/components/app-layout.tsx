"use client";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return <main className="flex-1 overflow-y-auto p-6">{children}</main>;
}
