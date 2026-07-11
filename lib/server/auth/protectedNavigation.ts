import "server-only";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import type { ServerAuthContextV1 } from "../../contracts/serverAuth";
import { safeNextDestination, verifyProtectedNavigationSession } from "../../auth/navigation";
import { verifyVelocitySessionCookie } from "./firebaseSessionCookie";

export async function requireProtectedNavigationSession(cookieValue: unknown, destination: unknown): Promise<ServerAuthContextV1> {
  noStore();
  const result = await verifyProtectedNavigationSession(cookieValue, verifyVelocitySessionCookie);
  if (!result.ok) redirect(`/auth/login?next=${encodeURIComponent(safeNextDestination(destination))}`);
  return result.context;
}
