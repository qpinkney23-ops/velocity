"use client";

import { useEffect, useState } from "react";
import {
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function UnderwritersPage() {
  const [underwriters, setUnderwriters] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "underwriters"), (snap) => {
      const rows = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setUnderwriters(rows);
    });

    return () => unsub();
  }, []);

  async function addUnderwriter() {
    if (!name || !email) {
      alert("Enter name and email");
      return;
    }

    await addDoc(collection(db, "underwriters"), {
      name,
      email,
      active: true,
      createdAt: serverTimestamp(),
    });

    setName("");
    setEmail("");
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6 space-y-6">

      <div>
        <h1 className="text-2xl font-semibold">Underwriters</h1>
        <p className="text-sm text-gray-500">
          Manage assignment pool for loan files
        </p>
      </div>

      {/* Add Form */}
      <div className="bg-white p-6 rounded-xl border shadow-sm space-y-4">
        <h2 className="font-semibold text-sm">Add Underwriter</h2>

        <div className="flex gap-3">
          <input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border px-3 py-2 rounded-lg w-full text-sm"
          />

          <input
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border px-3 py-2 rounded-lg w-full text-sm"
          />

          <button
            onClick={addUnderwriter}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm"
          >
            Add
          </button>
        </div>
      </div>

      {/* List */}
      <div className="bg-white p-6 rounded-xl border shadow-sm">
        <h2 className="font-semibold text-sm mb-4">Active Underwriters</h2>

        <div className="space-y-3">
          {underwriters.length === 0 && (
            <div className="text-sm text-gray-500">
              No underwriters yet
            </div>
          )}

          {underwriters.map((uw) => (
            <div
              key={uw.id}
              className="flex justify-between items-center border p-3 rounded-lg"
            >
              <div>
                <div className="text-sm font-medium">
                  {uw.name || "Unnamed"}
                </div>
                <div className="text-xs text-gray-500">
                  {uw.email}
                </div>
              </div>

              <div className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">
                Active
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}