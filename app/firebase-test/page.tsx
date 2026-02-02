"use client";

import { useEffect, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function FirebaseTestPage() {
  const [status, setStatus] = useState("Writing test ping...");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const ref = await addDoc(collection(db, "debug_pings"), {
          createdAt: serverTimestamp(),
          from: "firebase-test",
        });

        if (!cancelled) setStatus(`✅ Wrote debug_pings/${ref.id}`);
      } catch (e: any) {
        if (!cancelled) setStatus(`❌ Write failed: ${e?.message || String(e)}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Firebase Test</h1>
      <p>{status}</p>
      <p>
        After this says ✅, go to Firebase Console → Firestore Database → Data and
        you should see <b>debug_pings</b>.
      </p>
    </div>
  );
}
