// lib/storage.ts
// Storage helpers used by Application Detail page.
// Goal: never silently hang; always resolve or throw with a readable error.

import { ref, uploadBytesResumable, getDownloadURL, listAll } from "firebase/storage";
import { storage } from "./firebase";

export type UploadedDoc = {
  name: string;
  fullPath: string;
  downloadURL: string;
};

function normalizeFirebaseError(e: any): string {
  const msg = e?.message || "Upload failed";
  const code = e?.code ? ` (${e.code})` : "";
  return `${msg}${code}`;
}

export async function uploadApplicationFile(
  applicationId: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<UploadedDoc> {
  if (!applicationId) throw new Error("Missing applicationId for upload.");
  if (!file) throw new Error("Missing file.");

  // Canonical storage path per brief:
  // applications/{applicationId}/...files
  const safeName = file.name.replace(/[^\w.\- ]+/g, "_");
  const fullPath = `applications/${applicationId}/${Date.now()}__${safeName}`;
  const storageRef = ref(storage, fullPath);

  return await new Promise<UploadedDoc>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file);

    // Hard timeout (prevents “uploading…” forever)
    const timeoutMs = 60_000;
    const timer = setTimeout(() => {
      try {
        task.cancel();
      } catch {}
      reject(
        new Error(
          "Upload timed out after 60s. This usually means Storage rules/auth are blocking or connection stalled."
        )
      );
    }, timeoutMs);

    task.on(
      "state_changed",
      (snap) => {
        const pct = snap.totalBytes ? (snap.bytesTransferred / snap.totalBytes) * 100 : 0;
        if (onProgress) onProgress(Math.round(pct));
      },
      (err) => {
        clearTimeout(timer);
        reject(new Error(normalizeFirebaseError(err)));
      },
      async () => {
        clearTimeout(timer);
        try {
          const downloadURL = await getDownloadURL(task.snapshot.ref);
          resolve({ name: file.name, fullPath, downloadURL });
        } catch (e: any) {
          reject(new Error(normalizeFirebaseError(e)));
        }
      }
    );
  });
}

export async function listApplicationFiles(applicationId: string): Promise<UploadedDoc[]> {
  if (!applicationId) return [];
  const folderRef = ref(storage, `applications/${applicationId}`);
  const res = await listAll(folderRef);

  const docs: UploadedDoc[] = [];
  for (const item of res.items) {
    const downloadURL = await getDownloadURL(item);
    docs.push({
      name: item.name,
      fullPath: item.fullPath,
      downloadURL,
    });
  }

  return docs.sort((a, b) => (a.name < b.name ? 1 : -1));
}
