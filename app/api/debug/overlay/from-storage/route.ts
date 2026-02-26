import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    console.log("=== FROM STORAGE DEBUG START ===");

    const body = await req.json();

    console.log("BODY:", JSON.stringify(body, null, 2));

    if (!body.companyProfileId)
      throw new Error("Missing companyProfileId");

    if (!body.programKey)
      throw new Error("Missing programKey");

    if (!body.objectPath)
      throw new Error("Missing objectPath");

    console.log("Validation passed");

    // TEMP SAFE RESPONSE
    // We are ONLY proving handler execution
    return NextResponse.json({
      ok: true,
      message: "Handler reached successfully",
      received: body,
    });
  } catch (err: any) {
    console.error("FROM STORAGE CRASH:");
    console.error(err);
    console.error(err?.stack);

    return NextResponse.json(
      {
        ok: false,
        error: err?.message ?? "unknown",
        stack: err?.stack ?? null,
      },
      { status: 500 }
    );
  }
}