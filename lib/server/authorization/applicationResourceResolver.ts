import "server-only";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { initAdmin } from "../../firebase-admin";
import { resolveApplicationResourceFactsCore, type ApplicationResourceResolutionResult, type ResolveApplicationResourceFactsInput } from "./applicationResourceResolverCore";

export async function resolveApplicationResourceFacts(input: ResolveApplicationResourceFactsInput): Promise<ApplicationResourceResolutionResult> {
  try {
    const { app } = initAdmin(); const db = getFirestore(app);
    return resolveApplicationResourceFactsCore({ ...input, provenanceSource: "firestore_admin" }, { getApplicationById: async (applicationId) => { const snapshot = await db.collection("applications").doc(applicationId).get(); if (!snapshot.exists) return { exists: false }; const data = snapshot.data() ?? {}; return { exists: true, data: normalizeTimestamps(data) }; } });
  } catch { return Object.freeze({ ok: false, error: Object.freeze({ code: "DEPENDENCY_FAILURE", message: "Application resource could not be resolved.", ...(input.requestId ? { requestId: input.requestId } : {}), ...(input.correlationId ? { correlationId: input.correlationId } : {}) }) }); }
}

function normalizeTimestamps(value: unknown): unknown { if (value instanceof Timestamp) return value.toDate().toISOString(); if (Array.isArray(value)) return value.map(normalizeTimestamps); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, normalizeTimestamps(nested)])); return value; }
