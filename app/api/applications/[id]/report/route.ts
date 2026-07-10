import { NextResponse } from "next/server";
import { buildUnderwritingReport } from "@/lib/ai/buildUnderwritingReport";
import { renderUnderwritingPdf } from "@/lib/ai/renderUnderwritingPdf";

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeWorkflowPayload(body: any) {
  const workflow = body?.workflow || {};
  const readiness = body?.readiness || workflow?.readiness || null;
  const canonicalConditions =
    Array.isArray(body?.canonicalConditions)
      ? body.canonicalConditions
      : Array.isArray(workflow?.canonicalConditions)
      ? workflow.canonicalConditions
      : [];

  return {
    readiness:
      readiness && typeof readiness === "object"
        ? {
            readinessScore:
              typeof readiness.readinessScore === "number"
                ? readiness.readinessScore
                : typeof workflow.readinessScore === "number"
                ? workflow.readinessScore
                : 0,
            readinessLabel:
              cleanString(readiness.readinessLabel) ||
              cleanString(workflow.readinessLabel) ||
              "needs_review",
            workflowRisk:
              cleanString(readiness.workflowRisk) ||
              cleanString(workflow.workflowRisk) ||
              "review",
            estimatedCloseability:
              cleanString(readiness.estimatedCloseability) ||
              "review",
            unresolvedBlockingConditions:
              typeof readiness.unresolvedBlockingConditions === "number"
                ? readiness.unresolvedBlockingConditions
                : 0,
            unresolvedConditions:
              typeof readiness.unresolvedConditions === "number"
                ? readiness.unresolvedConditions
                : 0,
            borrowerActionCount:
              typeof readiness.borrowerActionCount === "number"
                ? readiness.borrowerActionCount
                : 0,
            processorActionCount:
              typeof readiness.processorActionCount === "number"
                ? readiness.processorActionCount
                : 0,
            underwriterActionCount:
              typeof readiness.underwriterActionCount === "number"
                ? readiness.underwriterActionCount
                : 0,
            topBlockingReasons:
              Array.isArray(readiness.topBlockingReasons)
                ? readiness.topBlockingReasons.filter(Boolean)
                : Array.isArray(workflow.topBlockingReasons)
                ? workflow.topBlockingReasons.filter(Boolean)
                : [],
            nextBestActions:
              Array.isArray(readiness.nextBestActions)
                ? readiness.nextBestActions.filter(Boolean)
                : Array.isArray(workflow.nextBestActions)
                ? workflow.nextBestActions.filter(Boolean)
                : [],
          }
        : {
            readinessScore:
              typeof workflow.readinessScore === "number"
                ? workflow.readinessScore
                : 0,
            readinessLabel: cleanString(workflow.readinessLabel) || "needs_review",
            workflowRisk: cleanString(workflow.workflowRisk) || "review",
            estimatedCloseability: "review",
            unresolvedBlockingConditions: 0,
            unresolvedConditions: 0,
            borrowerActionCount: 0,
            processorActionCount: 0,
            underwriterActionCount: 0,
            topBlockingReasons: Array.isArray(workflow.topBlockingReasons)
              ? workflow.topBlockingReasons.filter(Boolean)
              : [],
            nextBestActions: Array.isArray(workflow.nextBestActions)
              ? workflow.nextBestActions.filter(Boolean)
              : [],
          },

    canonicalConditions: canonicalConditions.map((condition: any) => ({
      id: cleanString(condition?.id),
      title:
        cleanString(condition?.title) ||
        cleanString(condition?.label) ||
        "Workflow Condition",
      category: cleanString(condition?.category) || "underwriting",
      severity: cleanString(condition?.severity) || "med",
      blocking: !!condition?.blocking,
      owner: cleanString(condition?.owner) || "system",
      resolutionStrategy:
        cleanString(condition?.resolutionStrategy) ||
        "manual_underwriter_review",
      borrowerVisible: !!condition?.borrowerVisible,
      autoClearEligible: !!condition?.autoClearEligible,
      requiredActions: Array.isArray(condition?.requiredActions)
        ? condition.requiredActions.filter(Boolean)
        : [],
      requiredDocuments: Array.isArray(condition?.requiredDocuments)
        ? condition.requiredDocuments.filter(Boolean)
        : [],
    })),
  };
}

function mergeWorkflowIntoReport(report: any, workflowPayload: ReturnType<typeof normalizeWorkflowPayload>) {
  return {
    ...report,
    workflow: {
      ...(report?.workflow || {}),
      readiness: {
        ...(report?.workflow?.readiness || {}),
        ...workflowPayload.readiness,
      },
      canonicalConditions:
        workflowPayload.canonicalConditions.length > 0
          ? workflowPayload.canonicalConditions
          : report?.workflow?.canonicalConditions || [],
    },
  };
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  try {
    const { id } = ctx.params;
    const body = await req.json().catch(() => ({} as any));

    const extracted = body?.extracted || {};
    const ai = body?.ai || null;
    const existingReport = body?.report || null;
    const workflowPayload = normalizeWorkflowPayload(body);

    if (!ai) {
      return NextResponse.json({ ok: false, error: "Missing ai payload" }, { status: 400 });
    }

    const baseReport =
      existingReport ||
      buildUnderwritingReport(
        {
          ...(ai || {}),
          readiness: workflowPayload.readiness,
          canonicalConditions: workflowPayload.canonicalConditions,
        } as any,
        {
          borrower: extracted.fullName || extracted.borrower || "",
          email: extracted.email || "",
          loanNumber: extracted.loanNumber || "",
          loanAmount: extracted.loanAmount ?? 0,
          propertyValue: extracted.propertyValue ?? 0,
          income: extracted.income ?? 0,
          debts: extracted.debts ?? 0,
          assets: extracted.assets ?? 0,
          dti: extracted.dti ?? ai?.dti ?? undefined,
        }
      );

    const report = mergeWorkflowIntoReport(baseReport, workflowPayload);

    const borrowerName = (extracted.fullName || extracted.borrower || "application").toString();
    const borrowerEmail = (extracted.email || "").toString();

    const pdfBuffer = await renderUnderwritingPdf({
      applicationId: id,
      borrowerName,
      borrowerEmail,
      report,
    });

    const safeName = borrowerName.replace(/[^\w\-]+/g, "_") || "application";

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}_underwriting_report.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.stack || e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
