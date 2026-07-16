import { timingSafeEqual } from "node:crypto";

export const DIAGNOSTIC_WORKER_RUN_POLICY = Object.freeze({
  version: "diagnostic-worker-run-policy.v1",
  productionEnabled: false,
  allowedMethod: "GET",
  allowedQuery: Object.freeze(["mode", "t"]),
  allowedMode: "tick",
  workerPaths: Object.freeze(["/api/worker/files/process", "/api/worker/ai/process"]),
});
type PublicBody = Readonly<{ ok: false; error: Readonly<{ code: "NOT_AVAILABLE" | "DIAGNOSTIC_AUTH_REQUIRED" | "PAYLOAD_INVALID" | "INTERNAL_ERROR"; message: string }> }> | Readonly<{ ok: true; runId: string; mode: "tick"; results: readonly Readonly<{ worker: "files" | "ai"; status: number; ok: boolean }>[] }>;
export type DiagnosticWorkerRunResult = Readonly<{ status: 200 | 400 | 403 | 404 | 500; body: PublicBody }>;
export interface DiagnosticWorkerRunDependencies { environment: string; projectId: string; enabled: boolean; expectedToken: string; trustedOrigin: string; workerSecret: string; dispatch(url: string, workerSecret: string): Promise<Readonly<{ ok: boolean; status: number }>>; createRunId(): string; }
const fail = (status: 400 | 403 | 404 | 500, code: "NOT_AVAILABLE" | "DIAGNOSTIC_AUTH_REQUIRED" | "PAYLOAD_INVALID" | "INTERNAL_ERROR"): DiagnosticWorkerRunResult => Object.freeze({ status, body: Object.freeze({ ok: false, error: Object.freeze({ code, message: code === "NOT_AVAILABLE" ? "Diagnostic route is not available" : code === "DIAGNOSTIC_AUTH_REQUIRED" ? "Diagnostic verification required" : code === "PAYLOAD_INVALID" ? "Diagnostic request is invalid" : "Diagnostic execution failed" }) }) });
function equal(a: string, b: string) { const left = Buffer.from(a), right = Buffer.from(b); return left.length === right.length && left.length >= 16 && timingSafeEqual(left, right); }
function origin(value: string): string | undefined { try { const parsed = new URL(value); if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return; return parsed.origin; } catch { return; } }
export async function executeDiagnosticWorkerRun(request: Request, d: DiagnosticWorkerRunDependencies): Promise<DiagnosticWorkerRunResult> {
  if (d.environment === "production" || !d.enabled || !/^demo-[a-z0-9-]+$/.test(d.projectId)) return fail(404, "NOT_AVAILABLE");
  if (request.method !== DIAGNOSTIC_WORKER_RUN_POLICY.allowedMethod) return fail(400, "PAYLOAD_INVALID");
  const url = new URL(request.url), keys = [...url.searchParams.keys()];
  if (keys.some(key => !DIAGNOSTIC_WORKER_RUN_POLICY.allowedQuery.includes(key)) || new Set(keys).size !== keys.length || (url.searchParams.get("mode") || "tick") !== "tick" || !/^[A-Za-z0-9._:-]{0,64}$/.test(url.searchParams.get("t") || "")) return fail(400, "PAYLOAD_INVALID");
  const token = request.headers.get("x-demo-token") || "";
  if (!equal(token, d.expectedToken)) return fail(403, "DIAGNOSTIC_AUTH_REQUIRED");
  const trustedOrigin = origin(d.trustedOrigin);
  if (!trustedOrigin || !d.workerSecret) return fail(500, "INTERNAL_ERROR");
  try {
    const results = [] as Array<Readonly<{ worker: "files" | "ai"; status: number; ok: boolean }>>;
    for (const [worker, path] of [["files", DIAGNOSTIC_WORKER_RUN_POLICY.workerPaths[0]], ["ai", DIAGNOSTIC_WORKER_RUN_POLICY.workerPaths[1]]] as const) { const dispatched = await d.dispatch(`${trustedOrigin}${path}`, d.workerSecret); results.push(Object.freeze({ worker, status: dispatched.status, ok: dispatched.ok })); }
    return Object.freeze({ status: 200, body: Object.freeze({ ok: true, runId: d.createRunId(), mode: "tick", results: Object.freeze(results) }) });
  } catch { return fail(500, "INTERNAL_ERROR"); }
}
