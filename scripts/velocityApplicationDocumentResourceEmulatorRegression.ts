import assert from "node:assert/strict";
import fs from "node:fs";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getMetadata, ref, uploadBytes } from "firebase/storage";
import { applicationDocumentResourceFixtures as f } from "../lib/contracts/applicationDocumentResourceFixtures";
import { resolveApplicationDocumentResourceFactsCore } from "../lib/server/authorization/applicationDocumentResourceResolverCore";

console.log("APPLICATION_DOCUMENT_RESOURCE_EMULATOR_CHILD_STARTED");

async function main() {
  const projectId = process.env.GCLOUD_PROJECT || "demo-velocity-application-document-resource";
  const environment = await initializeTestEnvironment({
    projectId,
    firestore: { host: "127.0.0.1", port: 8185, rules: fs.readFileSync("tests/tenant-authorization/firestore.test.rules", "utf8") },
    storage: { host: "127.0.0.1", port: 9295, rules: fs.readFileSync("tests/tenant-authorization/storage.test.rules", "utf8") },
  });
  try {
    await environment.withSecurityRulesDisabled(async (context) => {
      const firestore = context.firestore();
      const storage = context.storage();
      const documents = {
        document_alpha: f.document,
        wrong_application: { ...f.document, documentId: "wrong_application", applicationId: "application_beta", storagePath: f.path.replaceAll("document_alpha", "wrong_application") },
        cross_tenant: { ...f.document, documentId: "cross_tenant", tenantId: "tenant_beta", storagePath: f.path.replace("tenant_alpha", "tenant_beta").replaceAll("document_alpha", "cross_tenant") },
        legacy: { ...f.document, documentId: "legacy", ownershipState: "unresolved_legacy", tenantId: undefined, storagePath: "applications/application_alpha/legacy.pdf" },
        pending: { ...f.document, documentId: "pending", ownershipState: "migration_pending", tenantId: undefined },
        rejected: { ...f.document, documentId: "rejected", ownershipState: "migration_rejected", tenantId: undefined },
        cross_tenant_path: { ...f.document, documentId: "cross_tenant_path", storagePath: f.path.replace("tenant_alpha", "tenant_beta").replaceAll("document_alpha", "cross_tenant_path") },
        cross_application_path: { ...f.document, documentId: "cross_application_path", storagePath: f.path.replace("application_alpha", "application_beta").replaceAll("document_alpha", "cross_application_path") },
        malformed_path: { ...f.document, documentId: "malformed_path", storagePath: "malformed/path" },
        missing_object: { ...f.document, documentId: "missing_object", storagePath: f.path.replaceAll("document_alpha", "missing_object") },
      };
      await setDoc(doc(firestore, "applications/application_alpha"), f.application);
      for (const [id, data] of Object.entries(documents)) await setDoc(doc(firestore, `applicationDocuments/${id}`), JSON.parse(JSON.stringify(data)));
      await uploadBytes(ref(storage, f.path), new Uint8Array([1, 2, 3]), { contentType: "application/pdf", customMetadata: { tenantId: "tenant_alpha", applicationId: "application_alpha", documentId: "document_alpha" } });

      let applicationReads = 0, documentReads = 0, metadataReads = 0;
      const dependencies = {
        getApplicationById: async (id: string) => { applicationReads++; const snapshot = await getDoc(doc(firestore, `applications/${id}`)); return snapshot.exists() ? { exists: true, data: snapshot.data() } : { exists: false }; },
        getDocumentById: async (id: string) => { documentReads++; const snapshot = await getDoc(doc(firestore, `applicationDocuments/${id}`)); return snapshot.exists() ? { exists: true, data: snapshot.data() } : { exists: false }; },
        getStorageObjectMetadata: async (objectPath: string) => { metadataReads++; try { const metadata = await getMetadata(ref(storage, objectPath)); return { exists: true, bucket: metadata.bucket }; } catch { return { exists: false }; } },
      };
      const now = () => new Date(f.at);
      const run = (documentId: string, input: Record<string, unknown> = {}) => resolveApplicationDocumentResourceFactsCore({ applicationId: "application_alpha", documentId, ...input }, dependencies, now);
      let passed = 0;
      const test = async (name: string, check: () => unknown) => { await check(); console.log(`PASS ${++passed}: ${name}`); };
      const applicationBefore = (await getDoc(doc(firestore, "applications/application_alpha"))).data();
      const documentBefore = (await getDoc(doc(firestore, "applicationDocuments/document_alpha"))).data();

      await test("exact application lookup and exact document metadata lookup", async () => { applicationReads = documentReads = metadataReads = 0; const result = await run("document_alpha"); assert(result.ok); assert.equal(applicationReads, 1); assert.equal(documentReads, 1); assert.equal(metadataReads, 1); });
      await test("valid same-tenant document resolution uses authoritative persisted tenant", async () => { const result = await run("document_alpha"); assert(result.ok); assert.equal(result.facts.tenantId, "tenant_alpha"); });
      await test("caller tenant cannot override ownership", async () => assert(!(await run("document_alpha", { requestedTenantId: "tenant_beta" })).ok));
      await test("wrong-application document denied", async () => assert(!(await run("wrong_application")).ok));
      await test("cross-tenant document denied", async () => assert(!(await run("cross_tenant")).ok));
      await test("unresolved legacy denied", async () => assert(!(await run("legacy")).ok));
      await test("migration pending denied", async () => assert(!(await run("pending")).ok));
      await test("migration rejected denied", async () => assert(!(await run("rejected")).ok));
      await test("canonical Storage path accepted", async () => assert((await run("document_alpha")).ok));
      await test("cross-tenant Storage path denied", async () => assert(!(await run("cross_tenant_path")).ok));
      await test("cross-application Storage path denied", async () => assert(!(await run("cross_application_path")).ok));
      await test("malformed path denied", async () => assert(!(await run("malformed_path")).ok));
      await test("missing Storage object handled safely", async () => assert(!(await run("missing_object")).ok));
      await test("Storage metadata confirmed without byte download or signed URL generation", async () => { const result = await run("document_alpha"); assert(result.ok); assert(result.facts.compatibilityMetadata.storageObjectConfirmed); assert.equal(result.facts.provenance.bytesRead, false); assert.equal(result.facts.provenance.signedUrlGenerated, false); });
      await test("resolver performs no Firestore or Storage writes and source metadata is unchanged", async () => { await run("document_alpha"); assert.deepEqual((await getDoc(doc(firestore, "applications/application_alpha"))).data(), applicationBefore); assert.deepEqual((await getDoc(doc(firestore, "applicationDocuments/document_alpha"))).data(), documentBefore); });
      await test("PII OCR and mortgage data are excluded", async () => { const result = await run("document_alpha"); assert(result.ok); assert(!/borrower|email|ocr|loanAmount|mortgage/i.test(JSON.stringify(result))); });
      await test("dependency failure safely mapped", async () => { const result = await resolveApplicationDocumentResourceFactsCore({ applicationId: "application_alpha", documentId: "document_alpha" }, { ...dependencies, getDocumentById: async () => { throw Error("raw"); } }, now); assert(!result.ok); assert.equal(result.error.code, "DEPENDENCY_FAILURE"); });
      console.log(`Application document resource emulator regression: ${passed}/${passed} passed`);
    });
    console.log("APPLICATION_DOCUMENT_RESOURCE_EMULATOR_CHILD_COMPLETED");
  } finally {
    await environment.cleanup();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
