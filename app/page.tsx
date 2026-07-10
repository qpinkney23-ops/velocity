export default function Home() {
  return (
    <main className="min-h-screen" style={{ background: "var(--v-bg)" }}>
      <div className="max-w-5xl mx-auto px-6 py-14">
        <div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs bg-white/70"
          style={{ borderColor: "rgba(15,23,42,0.10)" }}
        >
          <span className="font-semibold">Velocity</span>
          <span style={{ color: "rgba(15,23,42,0.65)" }}>AI loan workflow</span>
        </div>

        <h1 className="mt-6 text-4xl md:text-5xl font-semibold leading-tight">
          Upload loan docs.
          <br />
          Get a borrower profile + underwriting conditions instantly.
        </h1>

        <p className="mt-5 text-base md:text-lg max-w-2xl" style={{ color: "rgba(15,23,42,0.75)" }}>
          Velocity turns messy mortgage files into a clean workflow:
          borrower profile fields, verified flags, AI scan summary, and auto-generated UW conditions.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <a className="v-btn-primary" href="/auth/login">
            Log in
          </a>
          <a className="v-btn" href="/auth/register">
            Create account
          </a>
          <a className="v-btn" href="/dashboard">
            Open dashboard
          </a>
        </div>

        <div className="mt-10 grid md:grid-cols-3 gap-3">
          {[
            { t: "AI Scan", d: "Run a scan to extract borrower data + doc summary." },
            { t: "Borrower Profile", d: "Fields show Missing/Extracted/Verified with one click." },
            { t: "UW Conditions", d: "Generate conditions from profile + verified flags. Mark done/reopen." },
          ].map((x) => (
            <div key={x.t} className="v-card p-5">
              <div className="text-sm font-semibold">{x.t}</div>
              <div className="text-xs v-muted mt-2">{x.d}</div>
            </div>
          ))}
        </div>

        <div className="mt-10 v-card p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Operational Safety
              </div>
              <div className="mt-1 text-lg font-semibold">Regression Suite Ready</div>
              <div className="text-xs v-muted mt-2 max-w-2xl">
                Last verified manually: DTI, Workflow, Report/PDF, and OCR regressions passed together through the
                master suite. Run this before major demos, deployments, or underwriting-engine edits.
              </div>
            </div>

            <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
              4/4 Protected
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
            {["DTI", "Workflow", "Report/PDF", "OCR"].map((item) => (
              <div key={item} className="rounded-xl border border-slate-200 bg-white/70 p-3">
                <div className="text-xs v-muted">Protected Area</div>
                <div className="mt-1 text-sm font-semibold">{item}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-950 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              Rerun Command
            </div>
            <code className="mt-2 block overflow-x-auto whitespace-nowrap text-xs text-white">
              cd /d C:\Users\Qpink\velocity && npx tsx scripts\velocityRegressionSuite.ts
            </code>
          </div>
        </div>

        <div className="mt-10 v-card p-5">
          <div className="text-sm font-semibold">Want a demo?</div>
          <div className="text-xs v-muted mt-2">
            Reply “demo” and I’ll send a walkthrough link + a test login.
          </div>
        </div>

        <div className="mt-10 text-xs v-muted">
          © {new Date().getFullYear()} Velocity • Built for speed, clarity, and clean loan workflows.
        </div>
      </div>
    </main>
  );
}
