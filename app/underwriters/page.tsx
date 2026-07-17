"use client";

import { useEffect, useState } from "react";
import { fetchApplicationPages } from "@/lib/applicationReadClient";

export default function UnderwritersPage() {
  const [underwriters, setUnderwriters] = useState<any[]>([]);

  useEffect(() => {
    let active=true;const load=()=>fetchApplicationPages(1).then(({assignees})=>{if(active)setUnderwriters(assignees)});void load();const timer=setInterval(load,15000);return()=>{active=false;clearInterval(timer)};
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-6 space-y-6">

      <div>
        <h1 className="text-2xl font-semibold">Underwriters</h1>
        <p className="text-sm text-gray-500">
          Manage assignment pool for loan files
        </p>
      </div>

      <div className="bg-white p-6 rounded-xl border shadow-sm space-y-2">
        <h2 className="font-semibold text-sm">Tenant assignment directory</h2>
        <p className="text-sm text-gray-500">Eligibility is derived from active tenant memberships. New underwriters require governed identity and membership provisioning.</p>
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
