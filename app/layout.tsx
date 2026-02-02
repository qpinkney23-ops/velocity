import "./globals.css";

import type { Metadata } from "next";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import AuthGuard from "@/components/auth/AuthGuard";
import { ToastProvider } from "@/components/ui/ToastProvider";

export const metadata: Metadata = {
  title: {
    default: "Velocity",
    template: "%s · Velocity",
  },
  description: "Loan workflow platform",
  applicationName: "Velocity",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  themeColor: "#1f6feb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <AuthGuard>
            <div className="flex min-h-screen">
              <Sidebar />
              <div className="flex-1 flex flex-col min-w-0">
                <Topbar />
                <main className="flex-1 p-4">{children}</main>
              </div>
            </div>
          </AuthGuard>
        </ToastProvider>
      </body>
    </html>
  );
}
