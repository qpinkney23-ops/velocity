import ProtectedNavigationLayout from "@/components/auth/ProtectedNavigationLayout";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedNavigationLayout>{children}</ProtectedNavigationLayout>;
}
