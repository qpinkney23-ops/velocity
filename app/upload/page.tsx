"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type AnyJson = any;

export default function UploadPage() {
  const sp = useSearchParams();
  const tFromUrl = sp.get("t") || "";
  const [t, setT] = useState<string>(tFromUrl);

  const [file, setFile] = useState<File | null>(null);
  const [appId, setAppId] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [lastRun, setLastRun] = useState<AnyJson | null>(null);

  const prettyLastRun = useMemo(() => {
    try {
      return lastRun ? JSON.stringify(lastRun, null, 2) : "";
    } catch {
      return String(lastRun);
    }
  }, [lastRun]);

  async function createApplication(): Promise<string> {
    const res = await fetch("/api/applications/create", { method: "POST" });
    const data = await res.json();

    if (!data?.appId || typeof data.appId !== "string") {
      throw new Error("Application creation failed: missing appId");
    }

    setAppId(data.appId);
    return data.appId;
  }

  async function runTickOnce() {
    const token = (t || "").trim();

    // If token is missing, we still run tick, but it will only tick existing jobs.
    const url = token
      ? `/api/debug/run?t=${encodeURIComponent(token)}&mode=tick`
      : `/api/debug/run?mode=tick`;

    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    setLastRun(data);

    if (!res.ok) {
      throw new Error(`Tick failed (${res.status}): ${text}`);
    }

    // If the API returns ok=false, surface that clearly
    if (data && data.ok === false) {
      throw new Error(`Tick returned ok=false: ${data.error || "unknown error"}`);
    }

    return data;
  }

  async function runTickLoop(maxTicks = 8, delayMs = 900) {
    for (let i = 1; i <= maxTicks; i++) {
      setStatus(`Tick ${i}/${maxTicks}...`);
      try {
        const data = await runTickOnce();

        // If a run processed an app, great — keep going a couple more ticks
        // so it can advance stages.
        // If nothing processed, we still continue a few ticks.
        void data;
      } catch (e: any) {
        // show error but keep looping a couple times (transient errors happen)
        setStatus(`Tick ${i}/${maxTicks} error: ${String(e?.message || e)}`);
      }

      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  async function uploadOnly() {
    if (!file) {
      alert("Select a PDF first");
      return;
    }

    setStatus("Creating application...");

    const id: string = (appId || "").trim() || (await createApplication());

    setStatus("Uploading...");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("appId", id);

    const uploadRes = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const uploadText = await uploadRes.text().catch(() => "");
    let uploadJson: any = null;
    try {
      uploadJson = uploadText ? JSON.parse(uploadText) : null;
    } catch {
      uploadJson = { raw: uploadText };
    }
    setLastRun({ upload: { status: uploadRes.status, body: uploadJson } });

    if (!uploadRes.ok) {
      throw new Error(`Upload failed (${uploadRes.status}): ${uploadText}`);
    }

    setStatus("Upload OK (now run Tick).");
  }

  async function autoProcess() {
    try {
      await uploadOnly();
      setStatus("Running ticks...");
      await runTickLoop(8, 900);
      setStatus("Done. Scroll down and copy the JSON if needed.");
    } catch (err: any) {
      console.error(err);
      setStatus(`Error: ${String(err?.message || err)}`);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Velocity Upload (Simple)</h1>

      <div style={{ marginTop: 12, padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontWeight: 600 }}>Demo token (t):</label>
          <input
            value={t}
            onChange={(e) => setT(e.target.value)}
            placeholder="demo216"
            style={{ padding: 8, width: 220 }}
          />

          <label style={{ fontWeight: 600 }}>App ID (optional):</label>
          <input
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            placeholder="leave blank to auto-create"
            style={{ padding: 8, width: 420 }}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={autoProcess} style={{ padding: "10px 14px", fontWeight: 700 }}>
            Auto Process (Upload → Tick)
          </button>

          <button
            onClick={async () => {
              try {
                await uploadOnly();
              } catch (e: any) {
                setStatus(`Error: ${String(e?.message || e)}`);
              }
            }}
            style={{ padding: "10px 14px" }}
          >
            1) Upload Only
          </button>

          <button
            onClick={async () => {
              setStatus("Running ticks...");
              await runTickLoop(8, 900);
              setStatus("Done ticking.");
            }}
            style={{ padding: "10px 14px" }}
          >
            2) Run Tick (x8)
          </button>

          <button
            onClick={async () => {
              setStatus("Ticking once...");
              try {
                await runTickOnce();
                setStatus("Tick complete.");
              } catch (e: any) {
                setStatus(`Tick error: ${String(e?.message || e)}`);
              }
            }}
            style={{ padding: "10px 14px" }}
          >
            Tick Once
          </button>
        </div>

        <p style={{ marginTop: 12 }}>
          <b>Status:</b> {status || "(idle)"}
        </p>

        {tFromUrl ? (
          <p style={{ marginTop: 6, opacity: 0.85 }}>
            Detected URL token: <code>{tFromUrl}</code>
          </p>
        ) : (
          <p style={{ marginTop: 6, opacity: 0.85 }}>
            Tip: open <code>/upload?t=demo216</code> so the page auto-fills <code>t</code>.
          </p>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Last response (copy/paste safe)</h2>
        <textarea
          value={prettyLastRun}
          readOnly
          style={{ width: "100%", height: 320, padding: 12, fontFamily: "monospace" }}
          placeholder="Run something above to populate this."
        />
      </div>
    </div>
  );
}