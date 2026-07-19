# Velocity Enterprise Document Bible

Status: Constitutional engineering standard  
Applies to: All synthetic mortgage documents and validation packages generated for Velocity  
Authority: Permanent unless superseded by an explicitly approved constitutional revision  

## 1. Mission

Velocity does not generate synthetic documents merely to create convenient test fixtures. Velocity generates entirely fictional mortgage files that reproduce the visual, structural, mathematical, chronological, and operational characteristics of production mortgage documents closely enough to support serious enterprise acceptance testing.

The target is a synthetic file that behaves like a real mortgage file when it passes through ingestion, rasterization, OCR, extraction, normalization, underwriting calculation, condition generation, explainability, reporting, and workflow systems. A validation document must challenge the system in the same ways that a production document does without containing real customer information or creating a document that could reasonably be mistaken for an instrument usable in a real transaction.

Enterprise validation must use enterprise-quality data. Simplified examples, unnaturally sparse pages, perfectly aligned digital text, repetitive templates, and mathematically convenient numbers are insufficient unless a test is specifically designated as a unit-level fixture. Validation packs governed by this Bible must model complete mortgage narratives, authentic document relationships, and realistic operational imperfections.

Every generated identity, account number, government identifier, institution, signature, contact point, property, and transaction must be synthetic. Documents must carry a durable synthetic-use notice that does not materially eliminate OCR realism. Synthetic data must never reuse a real applicant's personally identifiable information.

## 2. Constitutional Principles

### 2.1 Authenticity over convenience

Document structure, density, terminology, page flow, calculations, and visual presentation must reflect how the mortgage industry actually communicates. Generator convenience must not dictate unrealistic layouts or incomplete content.

### 2.2 Internal consistency over randomness

Randomness may create visual and portfolio diversity, but it must never independently alter governed facts. A package begins with one authoritative scenario model. Every document derives its values from that model. Random variations may affect presentation, not truth.

### 2.3 OCR realism over perfect readability

Production documents are readable to people yet imperfect for machines. Validation documents must include controlled scan artifacts, layout complexity, and text ambiguity. They must not be intentionally illegible unless the pack's difficulty tier requires it.

### 2.4 Diversity over repetition

No institution, employer, form, page arrangement, font combination, artifact pattern, or borrower profile should become the universal template. Repeated layouts train tests to a fixture rather than validating a system.

### 2.5 Mortgage-industry realism

Terminology, calculations, disclosures, dates, signatures, source relationships, account treatment, and underwriting expectations must match plausible mortgage practice. A visually convincing document with implausible mortgage content fails this standard.

### 2.6 Explainability

Every generated fact must be traceable to its scenario source and to every document where it appears. Every intentional conflict, omission, estimate, and scan defect must have a documented test purpose.

### 2.7 Deterministic generation

A released validation pack must be reproducible from a versioned scenario, generator version, institution-template versions, artifact profile, and deterministic seed. The same inputs must produce the same facts and, when required, byte-stable or visually equivalent outputs.

### 2.8 Mathematical consistency

Balances, subtotals, year-to-date earnings, taxes, payment schedules, cash to close, reserves, amortization, ratios, and running balances must reconcile. Rounding policy and display precision must be explicit.

### 2.9 Enterprise repeatability

Every pack must be independently buildable, verifiable, reviewable, and usable in automated acceptance testing. Validation cannot depend on undocumented manual corrections or knowledge held by one engineer.

## 3. Governing Scenario Model

Every validation package must begin with a single canonical scenario model. At minimum, that model must define:

- Synthetic borrower and co-borrower identities, relationships, identifiers, addresses, and occupancy.
- Employment history, compensation components, pay frequency, qualifying-income treatment, and effective dates.
- Assets, liabilities, ownership, account identifiers, transaction histories, and source-of-funds relationships.
- Property, transaction type, purchase price, appraised value, loan amount, subordinate financing, product, rate, term, and closing timeline.
- Taxes, insurance, mortgage insurance, HOA obligations, proposed housing payment, and escrow treatment.
- Credit bureau scores, representative-score method, tradelines, inquiries, derogatory events, and monthly obligations.
- Expected underwriting calculations, recommendation, conditions, conflicts, missing items, and workflow outcomes.
- Document inventory, issuing institution, template version, page count, document date, and scan profile.

The scenario model is authoritative. Documents may not calculate or invent governed facts independently. A separate engineering ground-truth record must preserve exact values, formulas, expected extractions, expected conditions, and intentional anomalies. Ground truth must never be embedded in the borrower-facing document package.

## 4. Universal Document Standards

Every document must satisfy the following rules unless a validation tier explicitly overrides them:

1. Use a plausible issuer, document title, reference identifier, date, page sequence, and legal or operational footer.
2. Match realistic information density. Production forms must not be reduced to a few oversized labels on an otherwise empty page.
3. Use appropriate field names, terminology, tables, continuation pages, disclosures, certifications, signatures, and contact blocks.
4. Preserve document-specific page dimensions and orientations when appropriate, including letter, legal, statement inserts, identification-card crops, and mixed portrait/landscape pages.
5. Render the final validation PDF as scanned imagery when the test calls for scanned documents. A scanned PDF must not retain a hidden perfect text layer unless testing hybrid PDFs intentionally.
6. Apply imperfections at the page level. Repeated identical noise, rotation, or shadow patterns across a package are prohibited.
7. Keep critical human-readable values recoverable at the declared difficulty level.
8. Include synthetic-use marking that remains visible but does not replace normal document content or layout.
9. Never copy protected forms, logos, signatures, barcodes, or layouts verbatim when a legally safe synthetic analogue is required. Reproduce industry structure and behavior without representing the document as genuine.
10. Record page-level artifact metadata in the engineering manifest.

## 5. Document-Type Standards

The following standards establish minimum content. Page counts are typical ranges, not artificial limits; complex scenarios may require continuation pages.

### 5.1 Uniform Residential Loan Application (1003)

- **Purpose:** Establish borrower identity, employment, income, assets, liabilities, real estate owned, declarations, loan purpose, property, and certifications.
- **Typical page count:** 5-10 pages, including continuation sheets and lender information.
- **Required sections:** Borrower information; employment and income; assets and liabilities; real estate owned; loan and property information; declarations; acknowledgments; demographic information when included; signatures and dates.
- **Common formatting:** Dense government-sponsored-enterprise-style form, checkboxes, numbered sections, small labels, tables, repeated borrower columns, continuation references.
- **Expected imperfections:** Skewed multipage scans, handwritten checkmarks, pen corrections, initials, faint continuation pages, uneven margins, duplex shadowing.
- **Expected OCR challenges:** Checkbox state, borrower/co-borrower column association, small-font labels, wrapped addresses, table boundaries, handwritten entries, repeated field names, continuation-page linkage.

### 5.2 Driver License or Government Identification

- **Purpose:** Support identity, date of birth, legal name, address, expiration, and document-number verification.
- **Typical page count:** 1-2 pages or card images.
- **Required sections:** Name, DOB, address, identifier, issue/expiration dates, class/type, photograph placeholder, issuing jurisdiction, machine-readable or barcode region where appropriate.
- **Common formatting:** Landscape card, security background, compact text, photo, signature, barcode or encoded block.
- **Expected imperfections:** Glare, perspective distortion, cropped edges, sleeve reflection, finger shadow, worn laminate.
- **Expected OCR challenges:** Hologram interference, low contrast, condensed fonts, abbreviated fields, barcode adjacency, perspective and rotation.

### 5.3 Social Security Card or Taxpayer-Identifier Evidence

- **Purpose:** Support name and taxpayer-identifier matching when policy and test scope permit.
- **Typical page count:** 1 page or card image.
- **Required sections:** Synthetic name, masked or clearly synthetic identifier, signature region, issuing authority analogue.
- **Common formatting:** Small card centered on a larger scan, security pattern, compact serif typography.
- **Expected imperfections:** Fold or wallet wear, soft focus, uneven lighting, partial shadow.
- **Expected OCR challenges:** Fine security background, similar glyphs, signature overlap, small type.

### 5.4 Tri-Merge Credit Report

- **Purpose:** Establish bureau scores, representative score, liabilities, payment history, inquiries, public records, and credit alerts.
- **Typical page count:** 10-60 pages.
- **Required sections:** Borrower identity; three bureau scores; summary; tradeline detail; monthly obligations; inquiries; collections/public records; score factors; compliance notices.
- **Common formatting:** Dense vendor report, repeated bureau abbreviations, monospaced or compressed tables, account masks, status codes, payment-history grids.
- **Expected imperfections:** Fax quality, clipped columns, page-break splits, toner variation, legacy print formatting.
- **Expected OCR challenges:** Distinguishing balances from monthly payments, bureau columns, score values from account data, duplicated merged tradelines, status abbreviations, zero-versus-letter substitutions.

### 5.5 Paystub

- **Purpose:** Support current employment, base and variable income, pay frequency, deductions, and year-to-date earnings.
- **Typical page count:** 1-2 pages per pay period.
- **Required sections:** Employer and employee; pay period; pay date; frequency; current and YTD earnings; hours/rate when applicable; taxes; deductions; net pay; employee identifier.
- **Common formatting:** Payroll-provider grid, detachable check region, earnings and deductions tables, compact current/YTD columns.
- **Expected imperfections:** Portal print-to-scan, folded check stock, faint gray table lines, cropped margins, mobile screenshot converted to PDF.
- **Expected OCR challenges:** Current versus YTD column association, decimal placement, negative deductions, hours versus dollars, multiple earning types.

### 5.6 W-2

- **Purpose:** Support historical wage income and employer continuity.
- **Typical page count:** 1-2 pages per tax year.
- **Required sections:** Employee/employer identities and addresses; EIN; Boxes 1-20 as applicable; tax year; retirement-plan indicators; state and local wages.
- **Common formatting:** Boxed federal form analogue, multiple copies, small box numbers and labels.
- **Expected imperfections:** Perforation shadow, folded mailer, dot-matrix or laser print, faint copy, partial edge crop.
- **Expected OCR challenges:** Box-number association, employer/employee address separation, state/local rows, missing decimal punctuation.

### 5.7 1099 Family

- **Purpose:** Support non-wage income such as contract, interest, dividend, retirement, or miscellaneous income.
- **Typical page count:** 1-2 pages per payer and form.
- **Required sections:** Form subtype and year; payer/payee; taxpayer identifiers; relevant income boxes; withholding; account number.
- **Common formatting:** Federal information-return analogue with subtype-specific numbered boxes.
- **Expected imperfections:** Mail folds, recipient-copy marks, mixed print darkness.
- **Expected OCR challenges:** Form-subtype identification, box mapping, payer/payee inversion, multiple forms on one scan.

### 5.8 Bank Statement

- **Purpose:** Support asset ownership, balances, transaction history, large-deposit analysis, reserves, and source of funds.
- **Typical page count:** 3-15 pages per account and month.
- **Required sections:** Institution; owner; masked account; statement period; beginning balance; deposits; withdrawals; fees; ending balance; transaction ledger; daily or running balances when normally provided.
- **Common formatting:** Branded summary page followed by dense transaction tables, continuation pages, disclosures.
- **Expected imperfections:** Downloaded statement rescanned, page curl, hole-punch or staple shadows, variable page quality.
- **Expected OCR challenges:** Running-balance reconciliation, negative signs, date/description/amount columns, wrapped merchant names, check images, deposits versus transfers.

### 5.9 Verification of Employment (VOE)

- **Purpose:** Verify employment status, tenure, position, compensation, likelihood of continuance, and employer contact.
- **Typical page count:** 1-3 pages.
- **Required sections:** Employee; employer; hire date; status; title; compensation; pay frequency; YTD/prior earnings when applicable; verifier; date; signature or electronic certification.
- **Common formatting:** Lender form, employer letterhead, third-party verification report, written and verbal VOE variants.
- **Expected imperfections:** Fax header, handwriting, stamps, initials, mixed typed and handwritten fields.
- **Expected OCR challenges:** Handwritten compensation, checkbox states, verifier notes, annual versus hourly rate, stale versus current dates.

### 5.10 Purchase Agreement

- **Purpose:** Establish parties, subject property, purchase price, financing, earnest money, concessions, contingencies, and closing date.
- **Typical page count:** 8-30 pages plus addenda.
- **Required sections:** Buyer/seller; legal/property address; price; deposits; financing; dates; concessions; included property; HOA disclosures; addenda; signatures and initials.
- **Common formatting:** State or broker contract, numbered paragraphs, legal language, repeated initials, electronic-signature certificates.
- **Expected imperfections:** Initialed pages, scanned signatures, marginal notes, uneven duplex scans, mixed original and addendum quality.
- **Expected OCR challenges:** Legal text density, amended values, strikeouts, multiple dates, initials, addendum precedence.

### 5.11 Appraisal

- **Purpose:** Support property characteristics, condition, comparable analysis, market value, and collateral eligibility.
- **Typical page count:** 20-60 pages including photographs, maps, exhibits, and certifications.
- **Required sections:** Subject; contract; neighborhood; site; improvements; room count; condition/quality; comparable grid; adjustments; reconciliation; value; appraiser certification; photos and maps.
- **Common formatting:** Uniform appraisal form analogue, dense grids, photo pages, map images, addenda.
- **Expected imperfections:** Color-to-grayscale conversion, compressed photos, rotated exhibits, mixed DPI, scanned sketches.
- **Expected OCR challenges:** Comparable-grid column alignment, adjustment signs, subject versus comparable values, photo-page noise, handwritten condition notes.

### 5.12 Homeowners Insurance Binder

- **Purpose:** Establish insured borrower/property, effective date, coverage, deductible, premium, carrier, and mortgagee clause.
- **Typical page count:** 1-5 pages.
- **Required sections:** Named insured; property; carrier/agent; policy or binder number; dates; dwelling coverage; deductible; annual premium; mortgagee.
- **Common formatting:** Carrier or agency letterhead, coverage table, binder certification.
- **Expected imperfections:** Email printout, fax marks, agency stamp, handwritten policy number.
- **Expected OCR challenges:** Annual versus monthly premium, coverage versus property value, mortgagee clause, effective/expiration dates.

### 5.13 Asset or Brokerage Statement

- **Purpose:** Support ownership, liquidity, market value, reserves, and eligible funds.
- **Typical page count:** 2-15 pages.
- **Required sections:** Institution; owner; masked account; period; beginning and ending values; holdings; cash; contributions/withdrawals; vested value when relevant.
- **Common formatting:** Portfolio summary, holdings tables, pie charts or allocation graphics, disclosures.
- **Expected imperfections:** Portal print, mixed portrait/landscape, compressed charts, faint footnotes.
- **Expected OCR challenges:** Market value versus cost basis, vested versus total balance, negative market change, account ownership.

### 5.14 Loan Estimate

- **Purpose:** Disclose loan terms, projected payments, costs, cash to close, comparisons, and servicing information.
- **Typical page count:** 3 pages.
- **Required sections:** Loan terms; projected payments; taxes/insurance/assessments; closing-cost details; cash to close; comparisons; disclosures; originator information.
- **Common formatting:** Standard three-page disclosure analogue with nested tables and checkbox indicators.
- **Expected imperfections:** Initial disclosure scan, e-sign footer, date stamp, slightly clipped printer margins.
- **Expected OCR challenges:** Loan amount/rate versus comparison figures, component-to-total reconciliation, lender credits, financed costs, checkbox state.

### 5.15 Closing Disclosure

- **Purpose:** Establish final or draft terms, projected payment, itemized costs, cash to close, transaction summaries, and confirmations.
- **Typical page count:** 5 pages.
- **Required sections:** Loan terms; projected payments; closing-cost details; calculating cash to close; borrower/seller summaries; loan calculations; disclosures; signatures when applicable.
- **Common formatting:** Standard five-page disclosure analogue with dense cost tables and page-specific legal footers.
- **Expected imperfections:** Draft watermark, e-sign marks, closing-package scan, settlement-agent stamps.
- **Expected OCR challenges:** Borrower-paid timing columns, subtotals, credits, negative values, draft versus final status, page linkage.

### 5.16 HOA Documentation

- **Purpose:** Establish mandatory dues, frequency, special assessments, transfer fees, project status, and account standing.
- **Typical page count:** 1-20 pages depending on certificate versus full package.
- **Required sections:** Association; property; dues; frequency; special assessments; balance/status; management contact; effective date.
- **Common formatting:** Assessment certificate, ledger, management-company letter, questionnaire, budget extract.
- **Expected imperfections:** Faxed management response, handwriting, stamps, attachment mix.
- **Expected OCR challenges:** Monthly versus quarterly frequency, special versus regular assessment, unit identification, handwritten balances.

### 5.17 Letter of Explanation (LOE)

- **Purpose:** Explain addresses, inquiries, employment gaps, deposits, credit events, occupancy, name variations, or other underwriting questions.
- **Typical page count:** 1-3 pages.
- **Required sections:** Borrower; date; issue addressed; factual explanation; relevant dates/amounts; signature.
- **Common formatting:** Borrower-authored letter, email printout, lender template, handwritten note.
- **Expected imperfections:** Informal formatting, scanned signature, handwriting, uneven margins.
- **Expected OCR challenges:** Narrative fact extraction, date and amount context, signatures, spelling variation.

### 5.18 Gift Letter

- **Purpose:** Document donor relationship, amount, source, transfer status, property, and no-repayment certification.
- **Typical page count:** 1-2 pages plus transfer evidence.
- **Required sections:** Donor and recipient; relationship; amount; source account; property; transfer date/status; no-repayment statement; signatures.
- **Common formatting:** Lender template or signed letter.
- **Expected imperfections:** Handwriting, mobile scans, initials, attached deposit receipt.
- **Expected OCR challenges:** Donor/borrower role assignment, masked accounts, amount consistency, signature detection.

### 5.19 CPA or Accountant Letter

- **Purpose:** Support self-employment tenure, business ownership, business-use funds, or expense treatment without replacing required tax evidence.
- **Typical page count:** 1-3 pages.
- **Required sections:** Firm; accountant; borrower/business; scope; relationship duration; factual certification; limitations; license/contact; signature/date.
- **Common formatting:** Professional letterhead with disclaimer and wet or digital signature.
- **Expected imperfections:** Letterhead scan, stamp, signature, fax header.
- **Expected OCR challenges:** Qualified language, ownership percentages, dates, business names, disclaimer separation.

### 5.20 Personal Tax Returns

- **Purpose:** Support historical income, filing status, dependents, deductions, business/rental/pass-through income, and tax liability.
- **Typical page count:** 20-100 pages per year.
- **Required sections:** Form 1040 analogue; schedules and forms required by scenario; taxpayer identity; filing year/status; income; adjustments; tax; signatures or e-file authorization.
- **Common formatting:** Government-form analogue, preparation software output, schedules, worksheets, e-file pages.
- **Expected imperfections:** Large mixed-quality packet, rotated schedules, stamps, handwritten annotations, missing blank pages.
- **Expected OCR challenges:** Tax-year association, line-number mapping, negative parentheses, carryovers, duplicated totals across worksheets.

### 5.21 Business Tax Returns

- **Purpose:** Support business income, ownership, compensation, distributions, liquidity, and trend analysis.
- **Typical page count:** 30-200 pages per entity and year.
- **Required sections:** Appropriate entity-return analogue; entity identity; ownership; income statement; balance sheet; schedules; K-1s; officer compensation; signatures/e-file authorization.
- **Common formatting:** Preparation-software packet with federal/state returns and depreciation schedules.
- **Expected imperfections:** Very large packet, mixed orientations, separator sheets, scan compression.
- **Expected OCR challenges:** Entity versus borrower values, fiscal years, intercompany items, page duplication, schedule linkage.

### 5.22 Schedule C

- **Purpose:** Support sole-proprietor revenue, expenses, net profit, depreciation, business use, and income trend.
- **Typical page count:** 2 pages plus supporting schedules.
- **Required sections:** Proprietor/business; activity; gross receipts; cost of goods; expenses; net profit; vehicle and other information.
- **Common formatting:** Numbered tax schedule with dense line items.
- **Expected imperfections:** Tax-software scan, handwritten preparer marks, faint negative values.
- **Expected OCR challenges:** Line association, expense add-backs, negative amounts, business identity.

### 5.23 Schedule K-1

- **Purpose:** Support ownership and pass-through income, distributions, liabilities, and entity relationship.
- **Typical page count:** 2-6 pages per entity.
- **Required sections:** Entity and partner/shareholder; identifiers; ownership percentages; income/loss boxes; distributions; capital account; supplemental statements.
- **Common formatting:** Federal schedule plus attached statements.
- **Expected imperfections:** Multi-entity packet, small-font attachments, page stamps.
- **Expected OCR challenges:** Entity matching, current-year versus ending ownership, passive/nonpassive amounts, supplemental-code mapping.

### 5.24 Trust Documents

- **Purpose:** Establish trust authority, ownership, access to assets/income, trustees, beneficiaries, and relevant restrictions.
- **Typical page count:** 10-100 pages or a shorter certification of trust.
- **Required sections:** Trust name/date; grantor; trustee; beneficiary; powers; revocability; asset/access provisions; amendments; signatures/notary.
- **Common formatting:** Legal instrument, exhibits, notarization, recorded stamps.
- **Expected imperfections:** Legal-size pages, mixed scan quality, seals, handwritten initials.
- **Expected OCR challenges:** Defined terms, party roles, amendments, legal descriptions, notarized signatures.

### 5.25 Rental Agreements and Lease Schedules

- **Purpose:** Support rental income, lease term, rent, deposits, occupancy, and property obligations.
- **Typical page count:** 3-20 pages per lease; 1-5 pages for schedules.
- **Required sections:** Landlord/tenant; property; term; monthly rent; deposits; payment timing; signatures; schedule totals when multiple units.
- **Common formatting:** Legal lease, property-manager form, rent roll, spreadsheet schedule.
- **Expected imperfections:** Initials, addenda, handwritten changes, scanned checks.
- **Expected OCR challenges:** Unit/tenant association, lease dates, monthly versus annual rent, concessions, amendments.

### 5.26 Divorce Decree and Child-Support Documentation

- **Purpose:** Establish support obligations/income, property division, debt responsibility, and duration.
- **Typical page count:** 10-80 pages plus payment history.
- **Required sections:** Parties; court; case; effective date; support amount/frequency; duration; property/debt terms; signatures/order stamp.
- **Common formatting:** Court order, legal captions, numbered findings, clerk stamps.
- **Expected imperfections:** Court scanning, stamps, seals, redactions, handwritten case annotations.
- **Expected OCR challenges:** Ordered versus proposed terms, monthly versus weekly support, termination triggers, party-role assignment.

### 5.27 Bankruptcy Paperwork

- **Purpose:** Establish chapter, filing/discharge dates, schedules, included debts, payment plan, and court disposition.
- **Typical page count:** 20-150 pages.
- **Required sections:** Court/case; debtor; chapter; petition; schedules; creditor matrix; plan when applicable; discharge/dismissal order.
- **Common formatting:** Federal court forms, docket headers, stamps, creditor tables.
- **Expected imperfections:** Download-and-scan, stamps, redactions, mixed packet quality.
- **Expected OCR challenges:** Case/date extraction, creditor matching, discharged versus surviving debt, dense schedules.

### 5.28 Large-Deposit and Source-of-Funds Documentation

- **Purpose:** Trace unusual deposits or closing funds to an acceptable source.
- **Typical page count:** 2-20 pages per event.
- **Required sections:** Deposit amount/date/account; originating source; transfer path; supporting sale, payroll, gift, or liquidation evidence; narrative when needed.
- **Common formatting:** Bank ledger, transfer confirmation, check, bill of sale, settlement statement, explanatory letter.
- **Expected imperfections:** Screenshots, partial account masks, mobile captures, mixed issuers and dates.
- **Expected OCR challenges:** Matching amount/date across documents, debit/credit direction, duplicate transfer legs, screenshot cropping.

### 5.29 Gift-Fund Evidence

- **Purpose:** Demonstrate donor ability, transfer, borrower receipt, and use in the transaction.
- **Typical page count:** 3-15 pages.
- **Required sections:** Gift letter; donor account evidence; transfer instrument; borrower deposit; closing credit when applicable.
- **Common formatting:** Cross-institution statement and receipt package.
- **Expected imperfections:** Mixed scan types, redaction, mobile banking screenshots.
- **Expected OCR challenges:** Cross-document lineage, account ownership, matching amounts, timing.

### 5.30 Employment Contract or Offer Letter

- **Purpose:** Establish future or current employment, start date, role, base pay, guaranteed compensation, conditions, and continuance.
- **Typical page count:** 2-10 pages.
- **Required sections:** Employer/employee; role; status; start date; location; compensation; contingencies; signatures.
- **Common formatting:** Employer letterhead, HR template, electronic-signature certificate.
- **Expected imperfections:** Email attachment scan, signatures, initials, corporate watermark.
- **Expected OCR challenges:** Base versus target compensation, conditional language, start date, remote work location.

### 5.31 Bonus and Commission Documentation

- **Purpose:** Support variable-income history, calculation method, likelihood of continuance, and current trend.
- **Typical page count:** 2-20 pages.
- **Required sections:** Compensation plan; eligibility; measurement period; payout history; YTD/prior years; employer verification; calculation worksheet.
- **Common formatting:** HR plan, payroll history, spreadsheet, manager letter.
- **Expected imperfections:** Mixed landscape tables, email printouts, handwritten underwriting worksheet.
- **Expected OCR challenges:** Period alignment, gross versus net, one-time versus recurring payments, tiered commission rates.

### 5.32 Military Income and Service Documents

- **Purpose:** Support active-duty status, rank, service dates, base pay, allowances, and continuance.
- **Typical page count:** 1-10 pages per document type.
- **Required sections:** Service member; branch; rank; service dates; leave-and-earnings components; orders or statement of service when relevant.
- **Common formatting:** Leave and Earnings Statement, orders, official memorandum.
- **Expected imperfections:** Monospaced reports, fax quality, stamps, security banners.
- **Expected OCR challenges:** Entitlement/deduction columns, abbreviations, temporary versus recurring allowances, dates.

### 5.33 VA Certificate and VA-Specific Documents

- **Purpose:** Support entitlement, eligibility, funding-fee treatment, residual-income review, and VA transaction requirements.
- **Typical page count:** 1-10 pages plus appraisal/notice documents.
- **Required sections:** Synthetic Certificate of Eligibility analogue; entitlement; service; loan information; funding fee/exemption; required notices.
- **Common formatting:** Government portal output, lender worksheet, veteran certifications.
- **Expected imperfections:** Portal printout, scanned signatures, stamps.
- **Expected OCR challenges:** Entitlement amounts, exemption status, restoration, service identity.

### 5.34 FHA Documents

- **Purpose:** Support FHA eligibility, case assignment, mortgage insurance, amendatory clauses, appraisal, and required certifications.
- **Typical page count:** 5-30 pages beyond standard file documents.
- **Required sections:** Case identifier; borrower/property; upfront and annual MIP treatment; amendatory clause; real-estate certification; appraisal notices; identity-of-interest data where applicable.
- **Common formatting:** Government/lender form analogues, certifications, worksheets.
- **Expected imperfections:** Mixed lender and government pages, stamps, initials.
- **Expected OCR challenges:** Case-number consistency, MIP amounts, signature/date completeness, checkbox certifications.

### 5.35 USDA Documents

- **Purpose:** Support property/location eligibility, household-income limits, guarantee fee, and program certifications.
- **Typical page count:** 5-30 pages beyond standard file documents.
- **Required sections:** Eligibility determination; household members/income; property; guarantee fee; certifications; underwriting findings analogue.
- **Common formatting:** Government portal output, worksheets, certifications.
- **Expected imperfections:** Portal print, mixed scan quality, stamps.
- **Expected OCR challenges:** Household versus qualifying income, limit tables, property eligibility, fee treatment.

### 5.36 Jumbo and Investor-Overlay Documents

- **Purpose:** Support enhanced reserves, liquidity, multiple appraisals, asset verification, credit depth, and investor-specific requirements.
- **Typical page count:** Variable; commonly adds 10-100 pages.
- **Required sections:** Overlay checklist; reserve calculation; asset concentration; appraisal review; large-deposit analysis; exposure schedule; exception documentation when relevant.
- **Common formatting:** Lender/investor worksheets, approval matrices, review certificates.
- **Expected imperfections:** Mixed spreadsheet and PDF sources, underwriting annotations, version stamps.
- **Expected OCR challenges:** Threshold-table association, reserve-month formulas, multiple property values, version precedence.

## 6. Institution and Template Library

Future generators must use a versioned institution library rather than one universal visual template. The library must include numerous synthetic analogues across these categories:

- Major national banks.
- Regional and community banks.
- Credit unions.
- Insurance carriers and independent agencies.
- Title, escrow, settlement, and closing companies.
- Appraisal management companies and individual appraisal firms.
- Tri-merge credit vendors and verification providers.
- Payroll processors and employer-native payroll systems.
- Brokerage, retirement, and investment firms.
- Mortgage lenders, brokers, servicers, and correspondent channels.
- Employers across corporate, healthcare, education, government, military, nonprofit, trade, retail, professional-services, and small-business sectors.

Each institution must support multiple layouts representing different products, account types, regions, acquisition histories, statement generations, portal versions, and time periods. A minimum mature library target is three materially distinct layouts per high-volume institution category and at least two scan profiles per layout.

Institution identity controls must include:

- Synthetic names, addresses, identifiers, contacts, and domains.
- Stable institution IDs independent of display names.
- Versioned logos or brand analogues that do not impersonate real issuers.
- Layout-specific field maps and page-count expectations.
- Supported date ranges and product types.
- Deterministic variation rules.
- Accessibility and legal-footer variants.

No validation release may consist primarily of one institution layout with superficial color or name changes.

## 7. Visual Realism and Artifact Rules

Artifact application must reproduce plausible acquisition paths. Each page receives a declared source profile such as office scanner, multifunction copier, fax, phone camera, portal print rescanned, screenshot-to-PDF, or mixed closing package.

Required supported effects include:

- Natural spacing and document-specific information density.
- Multiple realistic font families, weights, sizes, and numeric styles.
- Scanner skew and crooked scans.
- Phone-camera perspective and lens distortion.
- Page-edge, staple, binder, hole-punch, and page-stack shadows.
- Optional coffee stains or ordinary handling marks when appropriate.
- Fold marks, creases, curl, worn edges, and mailer perforations.
- JPEG and PDF compression artifacts.
- Fax degradation, scan lines, toner dropout, and low-contrast copies.
- Page rotation, blur, noise, grain, and color casts.
- Variable DPI and mixed page quality within a single file.
- Handwritten initials, checkmarks, notes, corrections, and dates.
- Realistic synthetic signatures and electronic-signature marks.
- Draft, copy, confidential, paid, received, or other appropriate watermarks.
- Barcodes, QR codes, account masks, document IDs, and machine-readable regions.
- Correct page numbers, continuation labels, legal footers, version dates, and form identifiers.

Artifact rules:

1. Effects must be seeded, recorded, and reproducible.
2. Effects must vary naturally by page and acquisition source.
3. Artifacts may not obscure all occurrences of a fact required for the intended test.
4. A page must not combine implausible artifacts, such as pristine vector text beneath severe fax degradation, unless testing a hybrid document explicitly.
5. Rotations, shadows, stains, and noise may not repeat at identical coordinates across documents.
6. Handwriting and signatures must be synthetic and must not reproduce a real person's signature.
7. Barcode or QR content must be synthetic, inert, and documented in ground truth.
8. DPI and compression must be sufficient to exercise OCR without reducing the document to arbitrary visual corruption.

## 8. Cross-Document Consistency Rules

Every non-conflict validation package must reconcile the following facts everywhere they appear:

### 8.1 Borrower identity

Legal name, permitted aliases, DOB, masked taxpayer identifier, current/prior addresses, contact information, marital status, citizenship/residency representation, and dependent count must follow one documented identity history.

### 8.2 Property and transaction

Subject address, unit, county, property type, occupancy, purchase price, appraised value, earnest money, concessions, loan purpose, loan amount, subordinate financing, rate, term, product, and closing date must reconcile across application, contract, appraisal, disclosures, insurance, title, and HOA evidence.

### 8.3 Employment and income

Employer name/address, occupation, start date, status, pay frequency, base rate, hours, salary, YTD earnings, prior-year earnings, bonus/commission history, and VOE values must form a chronologically plausible history. Paystub YTD amounts must equal or explain the pay periods and earning events represented.

### 8.4 Assets and funds

Account owners, masks, statement periods, beginning balances, deposits, withdrawals, fees, transfers, ending balances, daily/running balances, brokerage values, earnest money, cash to close, and post-closing reserves must reconcile arithmetically and chronologically.

### 8.5 Liabilities and credit

Creditor identity, account type, balance, monthly payment, status, ownership, inclusion treatment, inquiries, bureau score, representative score, and adverse history must reconcile across the application, credit report, bank activity, explanations, and underwriting truth.

### 8.6 Housing expense

Principal and interest, property taxes, homeowners insurance, flood insurance when applicable, mortgage insurance, HOA dues, subordinate payments, and total PITIA must reconcile across the loan terms, appraisal, binder, HOA evidence, Loan Estimate, Closing Disclosure, and ground truth.

### 8.7 Ratios and values

DTI components, consumer debt ratio, housing ratio, back-end DTI, LTV, CLTV/HCLTV, reserves, and cash to close must derive from the same authoritative values. A display-rounded figure must never be used as the source for another calculation when an unrounded authoritative value exists.

### 8.8 Dates and chronology

Application, document, statement, pay-period, credit-pull, contract, appraisal, insurance, disclosure, verification, and closing dates must form a plausible sequence. Employer tenure, address history, tax years, bank periods, and expiration dates must be valid relative to the scenario's as-of date.

### 8.9 Intentional conflicts

Conflicts are permitted only when a pack explicitly tests conflict detection. Every conflict must be defined in ground truth with:

- The conflicting values and documents.
- The authoritative value, if one exists.
- Expected detection and severity.
- Expected resolution path.
- Whether calculations must stop, proceed conservatively, or use a governed source preference.

Unplanned contradictions are release-blocking defects.

## 9. Mathematical and Chronological Validation

Before release, an automated validator must independently recompute and assert, as applicable:

- Pay frequency, current earnings, YTD earnings, and annualized income.
- Bank beginning balance plus credits minus debits equals ending balance.
- Transaction-level running balances.
- Asset totals, eligible funds, cash to close, and post-closing reserves.
- Liability subtotals and total monthly obligations.
- Fixed-rate amortized principal and interest.
- Monthly taxes, insurance, mortgage insurance, HOA, and PITIA.
- Consumer debt ratio, housing ratio, and back-end DTI.
- LTV, CLTV, and HCLTV using the governed value basis.
- Purchase price, down payment, financing, earnest money, costs, credits, and cash to close.
- Credit-score selection from borrower/bureau observations.
- Date ordering, statement continuity, pay-period sequence, document staleness, and term/expiration logic.

Validation must preserve both exact values and expected display rounding. The ground-truth record must state formulas, precision, and rounding rules.

## 10. Difficulty Levels

Difficulty is declared at both pack and page level.

### Level 1 - Clean production documents

Representative native-origin documents that have been printed and scanned cleanly. Mild skew, light compression, ordinary form density, complete pages, and no intentional conflicts. Used to establish functional acceptance.

### Level 2 - Typical lender scans

Mixed office scanning, phone captures, faxed verifications, mild handwriting, varied DPI, modest crop and rotation, realistic multipage packages, and ordinary document noise. This is the default enterprise-production tier.

### Level 3 - Poor OCR

Low contrast, stronger skew, fax degradation, partial shadows, table-line loss, compression, handwriting, mixed orientations, and challenging but human-recoverable text. Ground truth remains complete.

### Level 4 - Conflicting documents

Controlled material and nonmaterial conflicts, stale documents, amendments, competing values, duplicate evidence, and source-priority tests. Every conflict and expected resolution is explicitly declared.

### Level 5 - Enterprise stress testing

Large files, multiple borrowers/entities/properties, mixed tiers, missing and duplicate pages, difficult OCR, layered conflicts, complex income, multiple programs, high document volume, and operational retry or ordering challenges. Level 5 must remain diagnosable rather than arbitrarily chaotic.

## 11. Permanent Validation-Pack Program

The permanent acceptance portfolio consists of independently versioned packs:

| Pack | Scenario | Primary acceptance purpose | Default difficulty |
|---|---|---|---|
| 001 | Clean conventional purchase | Baseline complete-file extraction, calculations, conditions, report, and workflow | Level 1-2 |
| 002 | Typical production purchase | Ordinary mixed issuers and lender scan quality | Level 2 |
| 003 | Self-employed | Tax returns, business returns, K-1/Schedule C, cash flow, and trend | Level 2-3 |
| 004 | FHA | FHA documents, MIP, certifications, and program-specific file structure | Level 2 |
| 005 | VA | Eligibility, entitlement, military income, residual-income evidence, and VA documents | Level 2 |
| 006 | USDA | Household income, eligibility, guarantee documents, and rural-property evidence | Level 2 |
| 007 | Jumbo | Enhanced reserves, overlays, complex assets, appraisal review, and exposure | Level 2-3 |
| 008 | Multiple borrowers | Borrower attribution, combined liabilities/income, credit selection, and ownership | Level 2-3 |
| 009 | High DTI | Correct ratio construction, compensating factors, conditions, and decision boundaries | Level 2 |
| 010 | Fraud detection | Controlled identity, document, balance, employment, and alteration signals | Level 4-5 |
| 011 | Missing pages | Completeness detection, fail-closed behavior, and remediation workflow | Level 3-4 |
| 012 | Mixed scan quality | Page-level OCR routing and confidence across heterogeneous acquisition sources | Level 2-5 |

Each pack must have its own borrower and transaction unless the pack explicitly tests a longitudinal event. Borrower identities from regression fixtures or other validation packs must not be casually reused.

Every pack release must contain:

- Borrower-facing document archive.
- Separate engineering ground truth.
- Scenario and generator versions.
- Document manifest with issuer/layout/page/scan metadata.
- File hashes.
- Expected extractions and calculations.
- Expected underwriting recommendation, conditions, and workflow state.
- Intentional conflict/omission manifest, even when empty.
- Automated validation results.
- Visual-QA record.

## 12. Release Quality Checklist

Every generated package must pass all applicable checks before release.

### 12.1 Visual realism

- [ ] Every page was rendered and visually inspected.
- [ ] Layout, margins, tables, fonts, page numbering, and legal footers are plausible.
- [ ] No clipped, overlapping, missing, or unintentionally illegible content exists.
- [ ] Scan effects match declared acquisition sources and vary by page.
- [ ] Mixed-quality packs contain intentional, documented variation.
- [ ] Synthetic-use markings are present without dominating the document.

### 12.2 Internal consistency

- [ ] Identity, addresses, employment, property, and transaction facts reconcile.
- [ ] Income, assets, liabilities, taxes, insurance, HOA, rate, and payment reconcile.
- [ ] Bank summaries and running balances reconcile.
- [ ] Pay periods and YTD earnings reconcile.
- [ ] Purchase, appraisal, disclosure, insurance, title, and HOA values reconcile.
- [ ] DTI, LTV, CLTV/HCLTV, PITIA, funds, and reserves were independently recomputed.
- [ ] No contradiction exists unless declared as an intentional conflict.

### 12.3 OCR difficulty

- [ ] Raster/native/hybrid status matches the test design.
- [ ] OCR challenges are realistic, controlled, and documented.
- [ ] Required facts remain human-recoverable at the declared level.
- [ ] The package does not rely on a hidden perfect text layer unless intentionally testing one.
- [ ] OCR quality is not artificially identical across pages.

### 12.4 Document completeness

- [ ] Required document inventory is satisfied.
- [ ] Expected page counts and page sequences are correct.
- [ ] Continuation pages and addenda are linked.
- [ ] Signatures, initials, dates, certifications, and issuer contacts are present where expected.
- [ ] Missing pages or fields are documented when intentional.

### 12.5 Mortgage realism

- [ ] The transaction is plausible for the program, occupancy, property, credit, income, assets, and liabilities.
- [ ] Conditions are normal and scenario-appropriate.
- [ ] Program-specific documents and calculations are present.
- [ ] Document dates form a plausible origination and closing sequence.
- [ ] Terminology reflects mortgage practice.

### 12.6 Safety and release integrity

- [ ] All people, institutions, accounts, identifiers, properties, contacts, and signatures are synthetic.
- [ ] No real credentials, tokens, customer documents, or PII are present.
- [ ] Ground truth is excluded from the borrower-facing archive.
- [ ] The archive contains only intended release files.
- [ ] Hashes, versions, seed, and generation metadata were recorded.
- [ ] Independent engineering review approved the pack.

Failure of any required item blocks release.

## 13. Engineering Architecture Recommendations

Future document-generation systems should implement the following separation of concerns:

1. **Scenario authority:** A typed, immutable mortgage scenario containing exact facts and expected outcomes.
2. **Calculation authority:** One canonical calculator producing income, payment, asset, DTI, LTV, CLTV/HCLTV, and cash-to-close truth.
3. **Institution library:** Versioned issuer identities and multiple document layouts.
4. **Document renderers:** Document-type-specific renderers that consume facts but do not invent them.
5. **Artifact pipeline:** Seeded page-level acquisition and degradation profiles.
6. **Ground-truth compiler:** Expected OCR fields, normalized facts, calculations, conditions, and lineage.
7. **Consistency validator:** Independent arithmetic, chronology, cross-document, and inventory assertions.
8. **Visual-QA pipeline:** Page rendering, contact sheets, defect review, and approval evidence.
9. **Release packager:** Deterministic file naming, ZIP creation, ground-truth separation, manifest, and hashes.

Generators should fail closed when a required fact is absent, a calculation does not reconcile, a document contradicts the scenario unexpectedly, or visual QA has not completed.

## 14. Versioning and Change Control

Every implementation governed by this Bible must record:

- Bible version or source revision.
- Scenario schema version.
- Generator version.
- Calculation version.
- Institution and layout versions.
- Artifact-pipeline version.
- Deterministic seed.
- Validation timestamp and validator version.

Changes to document semantics, required sections, calculation definitions, or validation tiers require engineering review. A released pack must not be silently regenerated under new templates or calculations while retaining the same pack version.

Recommended release identifiers follow this pattern:

`velocity-enterprise-validation-pack-NNN.vMAJOR.MINOR`

- Increment major version for scenario truth, expected outcome, document inventory, or material layout changes.
- Increment minor version for nonmaterial visual improvements or corrected defects that preserve the intended scenario.

## 15. Constitutional Rule

This document is a constitutional engineering standard for Velocity synthetic mortgage documents.

All future document generators, fixtures represented as enterprise data, validation packs, acceptance suites, and externally reviewed synthetic mortgage packages must comply with this Bible. A generator may exceed these standards but may not silently weaken them. Exceptions must be explicit, narrowly scoped, documented in the pack manifest, and approved before release.

When speed, convenience, or implementation simplicity conflicts with authenticity, consistency, explainability, determinism, mathematical correctness, or enterprise repeatability, this Bible controls.
