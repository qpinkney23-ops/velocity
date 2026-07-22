import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { UnderwritingReport } from "./buildUnderwritingReport";

function money(n?: number | null) {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return `$${v.toLocaleString()}`;
}

function textOrDash(v?: string | number | null) {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

function titleize(value?: string | null) {
  const clean = (value || "").replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return "—";
  return clean.replace(/\b\w/g, (c) => c.toUpperCase());
}

function percentText(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value}%`;
}

function wrapText(text: string, maxChars = 95): string[] {
  const words = (text || "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export async function renderUnderwritingPdf(params: {
  applicationId: string;
  borrowerName?: string;
  borrowerEmail?: string;
  report: UnderwritingReport;
}) {
  const { applicationId, borrowerName, borrowerEmail, report } = params;

  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const marginX = 50;
  let y = height - 50;

  const line = (text: string, opts?: { size?: number; bold?: boolean; color?: [number, number, number]; gap?: number }) => {
    const size = opts?.size ?? 11;
    const useFont = opts?.bold ? bold : font;
    const color = opts?.color ? rgb(opts.color[0], opts.color[1], opts.color[2]) : rgb(0.1, 0.1, 0.1);

    if (y < 70) {
      page = pdfDoc.addPage([612, 792]);
      y = height - 50;
    }

    page.drawText(text, {
      x: marginX,
      y,
      size,
      font: useFont,
      color,
      maxWidth: width - marginX * 2,
    });

    y -= opts?.gap ?? size + 6;
  };

  const section = (title: string) => {
    y -= 4;
    line(title, { size: 14, bold: true, color: [0.05, 0.18, 0.45], gap: 18 });
  };

  const paragraph = (text: string, opts?: { size?: number; indent?: string }) => {
    for (const row of wrapText(text || "—")) {
      line(`${opts?.indent || ""}${row}`, { size: opts?.size ?? 11 });
    }
  };

  line("Velocity Underwriting Report", { size: 20, bold: true, color: [0.05, 0.18, 0.45], gap: 20 });
  line(`Application ID: ${applicationId}`, { size: 10 });
  line(`Generated: ${new Date().toLocaleString()}`, { size: 10, gap: 18 });

  section("Executive Summary");
  line(`Decision: ${textOrDash(report.summary.decision)}`, { bold: true });
  line(`Risk: ${textOrDash(report.summary.risk)}`);
  line(`Score: ${textOrDash(report.summary.score)}`);
  line(`Confidence: ${textOrDash(report.summary.confidence)}`);

  section("Borrower");
  line(`Name: ${textOrDash(borrowerName || report.borrower?.name)}`);
  line(`Email: ${textOrDash(borrowerEmail || report.borrower?.email)}`);
  line(`Loan Number: ${textOrDash(report.borrower?.loanNumber)}`);

  section("Loan");
  line(`Loan Amount: ${money(report.loan.loanAmount)}`);
  line(`Property Value: ${money(report.loan.propertyValue)}`);
  line(`LTV: ${textOrDash(report.loan.ltv)}%`);

  section("Financials");
  line(`Income: ${money(report.financials.income)}`);
  line(`Debts: ${money(report.financials.debts)}`);
  line(`DTI: ${textOrDash(report.financials.dti)}%`);
  line(`Consumer Debt Ratio: ${textOrDash(report.financials.consumerDebtRatio)}%`);
  line(`Total DTI: ${textOrDash(report.financials.totalDti)}%`);
  line(`Proposed Housing Payment: ${money(report.financials.proposedHousingPayment)}`);
  line(`Assets: ${money(report.financials.assets)}`);

  if (report.financials.housingPaymentBreakdown) {
    const housing = report.financials.housingPaymentBreakdown;

    section("Housing Payment Traceability");
    line(`Principal & Interest: ${money(housing.principalAndInterest)}`);
    line(`Taxes: ${money(housing.taxes)}`);
    line(`Insurance: ${money(housing.insurance)}`);
    line(`Mortgage Insurance: ${money(housing.mortgageInsurance)}`);
    line(`HOA: ${money(housing.hoa)}`);
    line(`Total PITIA: ${money(housing.total)}`, { bold: true });
    line(
      `Rate Assumption: ${
        typeof housing.estimatedRate === "number" && Number.isFinite(housing.estimatedRate)
          ? `${(housing.estimatedRate * 100).toFixed(3)}%`
          : "—"
      }`
    );
    line(`Assumption Source: ${titleize(housing.assumptionSource)}`);
    line(`Confidence: ${titleize(housing.confidence)}`);
  }

  const readiness = report.workflow?.readiness || null;
  const workflowConditions = report.workflow?.canonicalConditions || [];

  if (readiness) {
    section("Workflow Readiness");
    line(`Readiness Score: ${textOrDash(readiness.readinessScore)}%`, { bold: true });
    line(`Readiness Label: ${titleize(readiness.readinessLabel)}`);
    line(`Workflow Risk: ${titleize(readiness.workflowRisk)}`);
    line(`Estimated Closeability: ${titleize(readiness.estimatedCloseability)}`);
    line(`Unresolved Blocking Conditions: ${textOrDash(readiness.unresolvedBlockingConditions)}`);
    line(`Unresolved Conditions: ${textOrDash(readiness.unresolvedConditions)}`);
    line(`Borrower Action Count: ${textOrDash(readiness.borrowerActionCount)}`);
    line(`Processor Action Count: ${textOrDash(readiness.processorActionCount)}`);
    line(`Underwriter Action Count: ${textOrDash(readiness.underwriterActionCount)}`);

    if (readiness.topBlockingReasons?.length) {
      y -= 4;
      line("Top Blocking Reasons", { size: 12, bold: true, color: [0.05, 0.18, 0.45], gap: 16 });
      readiness.topBlockingReasons.slice(0, 6).forEach((reason, i) => {
        paragraph(`${i + 1}. ${reason}`, { size: 10 });
      });
    }

    if (readiness.nextBestActions?.length) {
      y -= 4;
      line("Next Best Actions", { size: 12, bold: true, color: [0.05, 0.18, 0.45], gap: 16 });
      readiness.nextBestActions.slice(0, 8).forEach((action, i) => {
        paragraph(`${i + 1}. ${action}`, { size: 10 });
      });
    }
  }

  if (workflowConditions.length) {
    section("Canonical Workflow Conditions");
    workflowConditions.slice(0, 12).forEach((condition, i) => {
      line(
        `${i + 1}. ${textOrDash(condition.title)}${condition.blocking ? " [BLOCKING]" : ""}`,
        { bold: true, size: 11, gap: 15 }
      );
      line(
        `   Category: ${titleize(condition.category)} | Owner: ${titleize(condition.owner)} | Severity: ${titleize(condition.severity)} | Strategy: ${titleize(condition.resolutionStrategy)}`,
        { size: 9 }
      );

      if (condition.requiredActions?.length) {
        paragraph(`Required Actions: ${condition.requiredActions.slice(0, 3).join("; ")}`, {
          size: 9,
          indent: "   ",
        });
      }

      if (condition.requiredDocuments?.length) {
        paragraph(`Required Documents: ${condition.requiredDocuments.slice(0, 3).join("; ")}`, {
          size: 9,
          indent: "   ",
        });
      }

      y -= 4;
    });
  }

  if (report.mortgageReview) {
    const review=report.mortgageReview;
    section("Enterprise Mortgage Review");
    line(`Status: ${titleize(review.status)}`,{bold:true});
    line(`Critical: ${review.counts.critical} | High: ${review.counts.high} | Medium: ${review.counts.medium} | Low: ${review.counts.low}`);
    line(`Blocking: ${review.counts.blocking} | Review Required: ${review.counts.reviewRequired} | Conditions: ${review.counts.conditionRequired}`);
    review.materialFindings.slice(0,10).forEach((finding,i)=>{
      line(`${i+1}. ${finding.title} [${titleize(finding.severity)}]`,{bold:true,size:11,gap:15});
      paragraph(finding.summary,{size:10,indent:"   "});
      paragraph(`Next action: ${finding.recommendedAction}`,{size:9,indent:"   "});
      if(finding.sourceReferences.length)line(`   Sources: ${finding.sourceReferences.slice(0,4).join(", ")}`,{size:9});
    });
  }

  section("Decision Reason");
  paragraph(report.decision.reason || "—");

  section("Conditions");
  if (report.decision.conditions?.length) {
    report.decision.conditions.forEach((c, i) => {
      paragraph(`${i + 1}. ${c}`);
    });
  } else {
    line("No conditions listed.");
  }

  if (report.decision.conditionSummary) {
    y -= 4;
    line("Condition Summary", { size: 12, bold: true, color: [0.05, 0.18, 0.45], gap: 16 });
    paragraph(report.decision.conditionSummary, { size: 10 });
  }

  section("Factors");
  if (report.factors?.length) {
    report.factors.forEach((f, i) => {
      line(`${i + 1}. ${f.label} (${f.impact})`, { bold: true, size: 11, gap: 15 });
      paragraph(f.summary || "", { size: 10, indent: "   " });

      if (f.source) {
        line(`   Source: ${f.source}`, { size: 9 });
      }

      if (f.value !== undefined && f.value !== null && f.value !== "") {
        line(`   Value: ${f.value}`, { size: 9 });
      }

      y -= 4;
    });
  } else {
    line("No factors returned.");
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
