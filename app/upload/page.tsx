"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type AnyJson = any;

async function readJsonSafe(res: Response) {
  const text = await res.text().catch(() => "");
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

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

  function withToken(path: string) {
    const token = (t || "").trim();
    if (!token) return path;
    const join = path.includes("?") ? "&" : "?";
    return `${path}${join}t=${encodeURIComponent(token)}`;
  }

  async function createApplication(): Promise<string> {
    const url = withToken("/api/applications/create");
    const res = await fetch(url, { method: "POST", cache: "no-store" });
    const data = await readJsonSafe(res);

    setLastRun({ createApplication: { url, status: res.status, body: data } });

    if (!res.ok) {
      throw new Error(`Application create failed (${res.status})`);
    }

    const newAppId = data?.appId;
    if (!newAppId || typeof newAppId !== "string") {
      throw new Error("Application creation failed: missing appId");
    }

    setAppId(newAppId);
    return newAppId;
  }

  async function runTickOnce() {
    const token = (t || "").trim();
    const url = token
      ? `/api/debug/run?t=${encodeURIComponent(token)}&mode=tick`
      : `/api/debug/run?mode=tick`;

    const res = await fetch(url, { cache: "no-store" });
    const data = await readJsonSafe(res);

    setLastRun((prev: any) => ({ ...(prev || {}), tick: { url, status: res.status, body: data } }));

    if (!res.ok) throw new Error(`Tick failed (${res.status})`);

    // Some pages treat ok=false as a hard failure
    if (data && data.ok === false) throw new Error(`Tick returned ok=false: ${data.error || "unknown"}`);

    return data;
  }

  async function runTickLoop(maxTicks = 8, delayMs = 900) {
    for (let i = 1; i <= maxTicks; i++) {
      setStatus(`Tick ${i}/${maxTicks}...`);
      try {
        await runTickOnce();
      } catch (e: any) {
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

    // IMPORTANT: include demo token on upload too
    const uploadUrl = withToken("/api/upload");

    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      body: formData,
    });

    const uploadBody = await readJsonSafe(uploadRes);

    setLastRun((prev: any) => ({
      ...(prev || {}),
      upload: { url: uploadUrl, status: uploadRes.status, body: uploadBody },
    }));

    if (!uploadRes.ok) {
      throw new Error(`Upload failed (${uploadRes.status})`);
    }

    setStatus("Upload OK (now run Tick).");
  }

  async function autoProcess() {
    try {
      await uploadOnly();
      setStatus("Running ticks...");
      await runTickLoop(10, 900);
      setStatus("Done. If Status is still parsing, click Auto Process again once.");
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
          <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
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
              await runTickLoop(10, 900);
              setStatus("Done ticking.");
            }}
            style={{ padding: "10px 14px" }}
          >
            2) Run Tick (x10)
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