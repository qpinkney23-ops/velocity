import { Canvas, createCanvas, SKRSContext2D } from "@napi-rs/canvas";
import { PDFDocument } from "pdf-lib";
import { AppliedPageArtifacts, PopulatedBankStatement } from "../contracts";
import { DeterministicRandom } from "../deterministic";

const PAGE_WIDTH_POINTS = 612;
const PAGE_HEIGHT_POINTS = 792;
const FIXED_PDF_DATE = new Date("2026-06-01T12:00:00.000Z");

export interface RasterizedBankStatement {
  readonly pdfBytes: Uint8Array;
  readonly pageImageBytes: readonly Uint8Array[];
}

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function displayDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year!, month! - 1, day)));
}

function setFont(context: SKRSContext2D, size: number, weight: "normal" | "bold" = "normal", family = "Arial"): void {
  context.font = `${weight} ${size}px ${family}`;
}

function text(context: SKRSContext2D, value: string, x: number, y: number, size = 13, color = "#1c2733", weight: "normal" | "bold" = "normal"): void {
  setFont(context, size, weight);
  context.fillStyle = color;
  context.fillText(value, x, y);
}

function rightText(context: SKRSContext2D, value: string, right: number, y: number, size = 12, color = "#1c2733", weight: "normal" | "bold" = "normal"): void {
  setFont(context, size, weight);
  context.fillStyle = color;
  context.fillText(value, right - context.measureText(value).width, y);
}

function line(context: SKRSContext2D, x1: number, y1: number, x2: number, y2: number, color = "#b7c0c8", width = 1): void {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.strokeStyle = color;
  context.lineWidth = width;
  context.stroke();
}

function barcode(context: SKRSContext2D, reference: string, x: number, y: number, width: number, height: number): void {
  let cursor = x;
  for (const character of reference) {
    const code = character.charCodeAt(0);
    for (let bit = 0; bit < 7 && cursor < x + width; bit += 1) {
      const barWidth = ((code >> bit) & 1) === 1 ? 3 : 1;
      context.fillStyle = "#27323c";
      context.fillRect(cursor, y, barWidth, height);
      cursor += barWidth + 2;
    }
  }
  text(context, reference, x, y + height + 12, 8, "#4e5b66");
}

function drawSyntheticNotice(context: SKRSContext2D, value: string, width: number, y: number): void {
  context.save();
  context.globalAlpha = 0.13;
  context.translate(width / 2, y);
  context.rotate(-0.28);
  setFont(context, 25, "bold");
  context.fillStyle = "#8d2734";
  const measured = context.measureText(value).width;
  context.fillText(value, -measured / 2, 0);
  context.restore();
}

function drawTraditional(document: PopulatedBankStatement, pageNumber: number, context: SKRSContext2D, width: number, height: number): void {
  const scale = width / 1275;
  context.save();
  context.scale(scale, scale);
  const logicalHeight = height / scale;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, 1275, logicalHeight);
  context.fillStyle = "#153f55";
  context.fillRect(0, 0, 1275, 94);
  text(context, "LAKEVIEW", 58, 56, 29, "#ffffff", "bold",);
  text(context, "COMMUNITY BANK", 224, 55, 13, "#dceaf0", "normal");
  rightText(context, pageNumber === 1 ? "CHECKING ACCOUNT STATEMENT" : "TRANSACTION CONTINUATION", 1215, 55, 18, "#ffffff", "bold");

  if (pageNumber === 1) {
    text(context, document.borrower.legalName, 62, 145, 16, "#18242e", "bold");
    document.borrower.addressLines.forEach((value, index) => text(context, value, 62, 172 + index * 22, 13));
    text(context, "Statement period", 725, 138, 11, "#56626c", "bold");
    text(context, `${displayDate(document.account.period.startDate)} - ${displayDate(document.account.period.endDate)}`, 725, 161, 15, "#18242e", "bold");
    text(context, "Account number", 725, 197, 11, "#56626c", "bold");
    text(context, document.maskedAccountNumber, 725, 220, 14);

    context.fillStyle = "#edf3f5";
    context.fillRect(55, 260, 1165, 160);
    text(context, "ACCOUNT SUMMARY", 76, 292, 14, "#153f55", "bold");
    const summary = [
      ["Beginning balance", money(document.account.beginningBalanceCents)],
      ["Deposits", money(document.depositsCents)],
      ["Withdrawals", `-${money(document.withdrawalsCents)}`],
      ["Fees", `-${money(document.feesCents)}`],
      ["Ending balance", money(document.endingBalanceCents)],
    ];
    summary.forEach(([label, value], index) => {
      const x = 76 + index * 225;
      text(context, label!, x, 333, 10, "#56626c");
      text(context, value!, x, 367, index === 4 ? 18 : 15, index === 4 ? "#153f55" : "#1c2733", "bold");
    });
  } else {
    text(context, document.borrower.legalName, 62, 142, 14, "#18242e", "bold");
    text(context, document.maskedAccountNumber, 62, 170, 12, "#56626c");
    rightText(context, `${displayDate(document.account.period.startDate)} - ${displayDate(document.account.period.endDate)}`, 1215, 142, 12, "#56626c");
    context.fillStyle = "#edf3f5";
    context.fillRect(55, 200, 1165, 48);
    text(context, "Continued from page 1", 74, 231, 12, "#153f55", "bold");
  }

  const tableTop = pageNumber === 1 ? 470 : 285;
  text(context, pageNumber === 1 ? "TRANSACTION ACTIVITY" : "TRANSACTION ACTIVITY - CONTINUED", 60, tableTop - 25, 14, "#153f55", "bold");
  context.fillStyle = "#153f55";
  context.fillRect(55, tableTop, 1165, 42);
  text(context, "DATE", 72, tableTop + 27, 11, "#ffffff", "bold");
  text(context, "DESCRIPTION", 180, tableTop + 27, 11, "#ffffff", "bold");
  rightText(context, "AMOUNT", 1005, tableTop + 27, 11, "#ffffff", "bold");
  rightText(context, "BALANCE", 1198, tableTop + 27, 11, "#ffffff", "bold");
  const items = pageNumber === 1 ? document.transactions.slice(0, 8) : document.transactions.slice(8);
  items.forEach((item, index) => {
    const y = tableTop + 80 + index * 67;
    if (index % 2 === 1) {
      context.fillStyle = "#f5f7f8";
      context.fillRect(55, y - 28, 1165, 52);
    }
    text(context, displayDate(item.date).replace(", 2026", ""), 72, y, 12);
    text(context, item.description, 180, y, 11);
    const signed = item.kind === "DEPOSIT" ? money(item.amountCents) : `-${money(item.amountCents)}`;
    rightText(context, signed, 1005, y, 12, item.kind === "DEPOSIT" ? "#176b45" : "#1c2733");
    rightText(context, money(item.runningBalanceCents), 1198, y, 12, "#1c2733", "bold");
    line(context, 55, y + 27, 1220, y + 27, "#d9dfe3");
  });

  const footerY = logicalHeight - 92;
  line(context, 55, footerY - 24, 1220, footerY - 24, "#82919b");
  text(context, `Questions? ${document.institution.customerService}  |  ${document.institution.website}`, 58, footerY, 10, "#4e5b66");
  text(context, "Member-equivalent fictional institution. Deposits and records shown are entirely synthetic.", 58, footerY + 23, 9, "#69757d");
  rightText(context, `Page ${pageNumber} of 2`, 1218, footerY, 10, "#4e5b66", "bold");
  barcode(context, `LV-${document.documentId.slice(-12)}-P${pageNumber}`, 947, footerY + 20, 270, 26);
  drawSyntheticNotice(context, document.institution.syntheticNotice, 1275, logicalHeight * 0.62);
  context.restore();
}

function drawModern(document: PopulatedBankStatement, pageNumber: number, context: SKRSContext2D, width: number, height: number): void {
  const scale = width / 1275;
  context.save();
  context.scale(scale, scale);
  const logicalHeight = height / scale;
  context.fillStyle = "#fbfcfd";
  context.fillRect(0, 0, 1275, logicalHeight);
  context.fillStyle = "#102d3b";
  context.fillRect(0, 0, 210, logicalHeight);
  text(context, "L", 64, 92, 54, "#62d0bd", "bold");
  text(context, "LAKEVIEW", 38, 132, 17, "#ffffff", "bold");
  text(context, "digital checking", 38, 158, 10, "#acd2d5");
  text(context, `PAGE ${pageNumber} / 2`, 38, 230, 11, "#62d0bd", "bold");
  text(context, "SUPPORT", 38, 294, 9, "#8fb5ba", "bold");
  text(context, document.institution.customerService, 38, 320, 10, "#ffffff");
  text(context, document.institution.website, 38, 344, 9, "#ffffff");
  barcode(context, `LVD${pageNumber}4821`, 38, logicalHeight - 170, 135, 32);

  text(context, pageNumber === 1 ? "Your May statement" : "Activity continued", 260, 82, 29, "#102d3b", "bold");
  rightText(context, document.maskedAccountNumber, 1210, 72, 11, "#61717b", "bold");
  rightText(context, `${displayDate(document.account.period.startDate)} - ${displayDate(document.account.period.endDate)}`, 1210, 94, 11, "#61717b");

  if (pageNumber === 1) {
    text(context, document.borrower.legalName, 260, 137, 15, "#102d3b", "bold");
    text(context, document.borrower.addressLines.join("  |  "), 260, 163, 11, "#61717b");
    const cards = [
      ["STARTING", money(document.account.beginningBalanceCents)],
      ["MONEY IN", money(document.depositsCents)],
      ["MONEY OUT + FEES", `-${money(document.withdrawalsCents + document.feesCents)}`],
      ["ENDING", money(document.endingBalanceCents)],
    ];
    cards.forEach(([label, value], index) => {
      const x = 260 + index * 235;
      context.fillStyle = index === 3 ? "#dff5ef" : "#eef2f4";
      context.fillRect(x, 205, 210, 105);
      text(context, label!, x + 16, 237, 9, "#61717b", "bold");
      text(context, value!, x + 16, 278, 16, index === 3 ? "#126246" : "#102d3b", "bold");
    });
  } else {
    context.fillStyle = "#dff5ef";
    context.fillRect(260, 130, 950, 88);
    text(context, "Opening balance on this page", 284, 164, 10, "#3f6e61", "bold");
    text(context, money(document.transactions[7]!.runningBalanceCents), 284, 197, 20, "#126246", "bold");
    rightText(context, "Transactions 9-16 of 16", 1180, 180, 11, "#3f6e61", "bold");
  }

  const tableTop = pageNumber === 1 ? 375 : 285;
  text(context, "Activity", 260, tableTop, 19, "#102d3b", "bold");
  text(context, pageNumber === 1 ? "First half of statement period" : "Second half of statement period", 260, tableTop + 27, 10, "#61717b");
  line(context, 260, tableTop + 50, 1210, tableTop + 50, "#102d3b", 2);
  text(context, "POSTED", 270, tableTop + 82, 9, "#61717b", "bold");
  text(context, "DETAIL", 390, tableTop + 82, 9, "#61717b", "bold");
  rightText(context, "CHANGE", 1000, tableTop + 82, 9, "#61717b", "bold");
  rightText(context, "AVAILABLE", 1200, tableTop + 82, 9, "#61717b", "bold");
  const items = pageNumber === 1 ? document.transactions.slice(0, 8) : document.transactions.slice(8);
  items.forEach((item, index) => {
    const y = tableTop + 130 + index * 68;
    text(context, displayDate(item.date).replace(", 2026", ""), 270, y, 11, "#46545e", "bold");
    text(context, item.description, 390, y, 11, "#102d3b");
    const signed = item.kind === "DEPOSIT" ? `+${money(item.amountCents)}` : `-${money(item.amountCents)}`;
    rightText(context, signed, 1000, y, 12, item.kind === "DEPOSIT" ? "#126246" : "#8a3642", "bold");
    rightText(context, money(item.runningBalanceCents), 1200, y, 12, "#102d3b");
    line(context, 260, y + 27, 1210, y + 27, "#dce3e6");
  });

  const footerY = logicalHeight - 82;
  context.fillStyle = "#eef2f4";
  context.fillRect(210, footerY - 34, 1065, 116);
  text(context, pageNumber === 1 ? "Activity continues on page 2 ->" : "End of statement - Ending balance confirmed", 260, footerY, 11, "#102d3b", "bold");
  text(context, "This record is synthetic and has no monetary or legal value.", 260, footerY + 27, 9, "#61717b");
  rightText(context, document.institution.address, 1210, footerY + 8, 9, "#61717b");
  drawSyntheticNotice(context, document.institution.syntheticNotice, 1275, logicalHeight * 0.66);
  context.restore();
}

function applyArtifacts(pristine: Canvas, artifact: AppliedPageArtifacts, seed: string): Uint8Array {
  const width = pristine.width;
  const height = pristine.height;
  const output = createCanvas(width, height);
  const context = output.getContext("2d");
  context.fillStyle = "#f7f6f2";
  context.fillRect(0, 0, width, height);
  context.save();
  context.translate(width / 2, height / 2);
  context.rotate((artifact.rotationDegrees * Math.PI) / 180);
  context.transform(1, artifact.skewPixels / height, artifact.skewPixels / width, 1, 0, 0);
  const inset = Math.max(5, Math.round(width * 0.007));
  context.drawImage(pristine, -width / 2 + inset, -height / 2 + inset, width - inset * 2, height - inset * 2);
  context.restore();

  const random = new DeterministicRandom(`${seed}:noise:page:${artifact.pageNumber}`);
  const noiseCount = Math.floor(width * height * artifact.noiseDensity);
  context.fillStyle = "rgba(44, 50, 53, 0.11)";
  for (let index = 0; index < noiseCount; index += 1) {
    const marginSide = random.next() < 0.5;
    const x = marginSide ? random.between(0, width * 0.045) : random.between(width * 0.955, width);
    const y = random.between(0, height);
    context.fillRect(x, y, 1, 1);
  }
  if (artifact.foldShadowApplied) {
    const gradient = context.createLinearGradient(0, height * 0.51, width, height * 0.53);
    gradient.addColorStop(0, "rgba(80,75,68,0)");
    gradient.addColorStop(0.48, "rgba(80,75,68,0.035)");
    gradient.addColorStop(0.5, "rgba(80,75,68,0.09)");
    gradient.addColorStop(0.52, "rgba(80,75,68,0.025)");
    gradient.addColorStop(1, "rgba(80,75,68,0)");
    context.fillStyle = gradient;
    context.fillRect(0, height * 0.49, width, height * 0.06);
  }
  return output.encodeSync("jpeg", artifact.jpegQuality);
}

export async function rasterizeBankStatement(
  document: PopulatedBankStatement,
  artifacts: readonly AppliedPageArtifacts[],
  seed: string,
): Promise<RasterizedBankStatement> {
  if (artifacts.length !== 2) throw new Error("Bank statement vertical slice requires exactly two artifact plans.");
  const pageImageBytes = artifacts.map((artifact) => {
    const width = Math.round(8.5 * artifact.dpi);
    const height = Math.round(11 * artifact.dpi);
    const pristine = createCanvas(width, height);
    const context = pristine.getContext("2d");
    if (document.layout.structure === "TRADITIONAL_REGIONAL") {
      drawTraditional(document, artifact.pageNumber, context, width, height);
    } else {
      drawModern(document, artifact.pageNumber, context, width, height);
    }
    return applyArtifacts(pristine, artifact, `${seed}:${document.layout.id}`);
  });

  const pdf = await PDFDocument.create();
  pdf.setTitle("Synthetic Lakeview Community Bank Statement");
  pdf.setAuthor("Velocity Enterprise Renderer");
  pdf.setSubject("Synthetic validation document; not an actual bank record");
  pdf.setCreator("Velocity Enterprise Renderer v1.0.0");
  pdf.setProducer("Velocity Enterprise Renderer v1.0.0");
  pdf.setCreationDate(FIXED_PDF_DATE);
  pdf.setModificationDate(FIXED_PDF_DATE);
  for (const bytes of pageImageBytes) {
    const image = await pdf.embedJpg(bytes);
    const page = pdf.addPage([PAGE_WIDTH_POINTS, PAGE_HEIGHT_POINTS]);
    page.drawImage(image, { x: 0, y: 0, width: PAGE_WIDTH_POINTS, height: PAGE_HEIGHT_POINTS });
  }
  return Object.freeze({
    pdfBytes: new Uint8Array(await pdf.save({ useObjectStreams: false, addDefaultPage: false, updateFieldAppearances: false })),
    pageImageBytes: Object.freeze(pageImageBytes),
  });
}
