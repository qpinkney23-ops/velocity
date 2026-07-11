import { cookies, headers } from "next/headers";
import { requireProtectedNavigationSession } from "@/lib/server/auth/protectedNavigation";

export default async function ProtectedNavigationLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies();
  const sessionCookie = cookieStore.get(process.env.NODE_ENV === "production" ? "__Host-velocity_session" : "velocity_session")?.value;
  const requestHeaders = headers();
  const destination = `${requestHeaders.get("x-velocity-pathname") || "/dashboard"}${requestHeaders.get("x-velocity-search") || ""}`;
  await requireProtectedNavigationSession(sessionCookie, destination);
  return <>{children}</>;
}
