import { NextResponse } from "next/server";
import { executeDiagnosticWorkerRun } from "@/lib/server/diagnostics/diagnosticWorkerRunCore";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const result = await executeDiagnosticWorkerRun(request, {
    environment: process.env.NODE_ENV || "production",
    projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "",
    enabled: process.env.VELOCITY_DEMO_DIAGNOSTICS_ENABLED === "true",
    expectedToken: process.env.DEMO_TOKEN || "",
    trustedOrigin: process.env.NEXT_PUBLIC_APP_URL || "",
    workerSecret: process.env.WORKER_SECRET || process.env.X_WORKER_SECRET || "",
    dispatch: async (url, workerSecret) => {
      const response = await fetch(url, { method: "POST", headers: { "x-worker-secret": workerSecret }, cache: "no-store" });
      return Object.freeze({ ok: response.ok, status: response.status });
    },
    createRunId: () => crypto.randomUUID(),
  });
  return NextResponse.json(result.body, { status: result.status, headers: { "cache-control": "no-store" } });
}
