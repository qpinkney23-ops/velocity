import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    return NextResponse.json( {
      ok: true,
      received: body ?? {},
      result: {
        summary: "Dummy scan successful. API is returning JSON.",
        findings: [
          "Income appears consistent (dummy)",
          "DTI within threshold (dummy)",
          "Conditions: verify paystubs, W-2s, bank statements (dummy)"
        ],
        conditions: [
          "VOE within 10 days of closing",
          "Appraisal and title",
          "No new undisclosed debts"
        ],
        risk: "LOW"
      }
    });
  } catch (e: any) {
    return NextResponse.json( { ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
