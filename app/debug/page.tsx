// app/debug/page.tsx
// SERVER COMPONENT — reads env at runtime on the server

export default function DebugEnvPage() {
  const keys = [
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
  ] as const;

  const data = keys.map((k) => {
    const v = process.env[k];
    return {
      key: k,
      value:
        typeof v === "string" && v.length > 0
          ? `${v.slice(0, 6)}…${v.slice(-4)}`
          : "(missing)",
    };
  });

  return (
    <div style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Velocity Env Debug (Server)</h1>
      <p>
        This page runs on the server. If values show <b>(missing)</b>, Next is not
        reading env files from the project root you are running.
      </p>

      <pre
        style={{
          marginTop: 16,
          padding: 16,
          background: "#111",
          color: "#0f0",
          borderRadius: 8,
          overflowX: "auto",
        }}
      >
        {JSON.stringify(data, null, 2)}
      </pre>

      <p style={{ marginTop: 16, opacity: 0.8 }}>
        Path: <b>/debug</b>
      </p>
    </div>
  );
}

