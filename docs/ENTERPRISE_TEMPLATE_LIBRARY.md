# Velocity Enterprise Template Library

Status: Permanent architectural reference  
Governing authority: `docs/ENTERPRISE_DOCUMENT_BIBLE.md`  
Companion reference: `docs/ENTERPRISE_INSTITUTION_LIBRARY.md`  

## 1. Mission

The Velocity Enterprise Template Library defines the reusable document families, structural variants, visual systems, continuation behavior, and OCR profiles supported by future synthetic-mortgage generators. Its objective is to produce entirely synthetic documents that reproduce the structure and behavior of production mortgage files without copying a real issuer's protected design or creating an instrument that could be used as an authentic document.

Templates are not convenient test forms. They are versioned production analogues. Each template must preserve realistic information density, document-specific terminology, page flow, tables, disclosures, signatures, identifiers, and acquisition artifacts. Every rendered fact must originate from an authoritative scenario model; templates may format facts but may not invent or alter them.

## 2. Template-Family Contract

Every template family and variant must declare:

- Stable family and variant identifiers.
- Purpose and supported mortgage use cases.
- Typical and permitted page counts.
- Supported page sizes and orientations.
- Common layouts and section order.
- Header and footer structure.
- Typography roles and fallback fonts.
- Table, grid, checkbox, and callout styles.
- Signature, initials, date, stamp, and notary locations.
- Barcode and QR-code placement and synthetic payload rules.
- Watermark types and placement.
- Legal disclosures and version/footer language.
- Continuation-page and overflow behavior.
- Addendum, attachment, exhibit, and mixed-orientation behavior.
- Supported institution-family bindings.
- Easy, typical, hard, and extreme OCR profiles.
- Deterministic layout and artifact parameters.
- Expected field map, repeated fields, and source-of-truth bindings.

No released family may consist of one layout with cosmetic color substitutions. Each high-volume family requires at least three materially different layouts; specialist families require at least two.

## 3. Common Variant Model

Each family should draw from these structural variants where appropriate:

1. **Government/form analogue:** Numbered boxes, standardized sections, compact labels, certifications, and revision footer.
2. **Institution-native statement:** Branded summary, account or case metadata, dense transaction/detail pages, disclosures.
3. **Professional letter:** Letterhead, subject/reference block, narrative or concise fact table, signature and credential footer.
4. **Portal output:** Application banner, generated timestamp, reference identifier, screen-oriented tables, print footer.
5. **Legacy/fax form:** Monospaced or condensed type, thick rules, handwriting zones, fax header, low-contrast fields.
6. **Closing-package form:** Page-specific legal footer, initials, e-sign certificate, stamps, and package numbering.
7. **Worksheet/schedule:** Spreadsheet-like grid, totals, formulas, preparer/reviewer blocks, continuation rows.
8. **Evidence bundle:** Cover page followed by heterogeneous attachments, receipts, screenshots, checks, or supporting statements.

Variants must differ structurally in hierarchy, field placement, pagination, table design, and continuation logic.

## 4. Reusable Document Components

### 4.1 Identity and address components

- Borrower/co-borrower blocks with role-safe column association.
- Current, prior, mailing, employer, property, and legal-description address blocks.
- Synthetic identifier blocks with configurable masking and character grouping.
- Photo-identification regions with portrait, physical descriptors, issue/expiration fields, and machine-readable zones.

### 4.2 Employment and income components

- Employer identity and contact blocks.
- Employment-history rows and current/prior employment sections.
- Current/YTD/prior-year income tables.
- Hourly, salary, overtime, bonus, commission, military allowance, and self-employment presentations.
- Pay-period, pay-date, frequency, hours, rate, deductions, and net-pay grids.

### 4.3 Assets and transaction components

- Account-owner and masked-account blocks.
- Summary, holdings, transaction, running-balance, and transfer tables.
- Deposit/source linkage cards.
- Asset, reserve, cash-to-close, and liquidation summaries.

### 4.4 Property and loan components

- Property/occupancy blocks.
- Loan-term and projected-payment summaries.
- Purchase-price, appraisal, financing, earnest-money, and concession tables.
- PITIA, escrow, mortgage-insurance, HOA, and subordinate-financing rows.
- Cost, credit, and cash-to-close disclosure boxes.

### 4.5 Legal and execution components

- Wet-signature, digital-signature, initials, and date blocks.
- Notary acknowledgment and seal regions.
- Certification, authorization, disclosure, and attestation boxes.
- Court caption, docket, filing stamp, and ordered-relief blocks.
- Amendment, addendum, exhibit, and superseding-term markers.

### 4.6 Machine and navigation components

- Synthetic linear barcodes and inert QR codes.
- Document IDs, case IDs, account masks, revision codes, and generated timestamps.
- Page footers, page x of y, section tabs, continuation markers, and carry-forward totals.
- Draft, copy, received, paid, confidential, void, and synthetic-validation watermarks.

Components must accept semantic facts and accessibility metadata. They must not calculate underwriting values independently.

## 5. Template Families

### 5.1 Uniform Residential Loan Application (1003)

- **Purpose/pages:** Complete borrower, employment, income, assets, liabilities, property, declarations, demographics, and certifications; normally 5-10 pages.
- **Layouts:** Modern sectioned application; legacy two-column form; lender portal export with continuation schedules.
- **Header/footer/type:** Form title, borrower/loan reference, section numbering; revision/form identifier and page x of y; condensed sans-serif labels with readable body text.
- **Tables/signatures/codes:** Borrower/co-borrower tables, employment/assets/liabilities grids, declarations checkboxes; certifications and signatures near final sections; document barcode in lower margin and optional portal QR on cover.
- **Watermarks/legal/continuation:** Draft or completed watermark; borrower certification and demographic notices; labeled continuation sheets repeat borrower and loan references.
- **Attachments/OCR:** Addenda and lender-information pages remain linked. Typical OCR must handle checkboxes and dense columns; hard variants add handwriting and skew; extreme variants add amendments and mixed-quality continuation pages.

### 5.2 Loan Estimate

- **Purpose/pages:** Disclose loan terms, projected payments, costs, cash to close, comparisons, and originator data; 3 pages.
- **Layouts:** Standard disclosure analogue; lender-branded monochrome; portal-rendered e-disclosure.
- **Header/footer/type:** Borrower/property/date/loan header; page-specific disclosure footer and form revision; compact sans-serif with strong section numerals.
- **Tables/signatures/codes:** Loan terms, projected payment, closing-cost detail, cash-to-close, and comparisons; acknowledgment only where appropriate; barcode or document ID in footer, QR only for inert portal-reference tests.
- **Watermarks/legal/continuation:** Initial, revised, or sample watermark; required disclosure language; no uncontrolled overflow—supplements attach after page 3.
- **Attachments/OCR:** Change-of-circumstance cover may precede. OCR complexity centers on nested totals, lender credits, checkbox states, and page-specific column meanings.

### 5.3 Closing Disclosure

- **Purpose/pages:** Present final/draft loan terms, payments, itemized costs, transaction summaries, and loan calculations; normally 5 pages.
- **Layouts:** Settlement-system output; lender e-closing output; scanned signed closing package.
- **Header/footer/type:** Closing status and dates, borrower/property/loan metadata; page-specific legal footer and package ID; compact disclosure typography.
- **Tables/signatures/codes:** Cost timing columns, borrower/seller summaries, loan calculations, signature/acknowledgment area; closing-package barcode and optional e-sign QR.
- **Watermarks/legal/continuation:** Draft, estimated, final, or corrected watermark; required legal disclosures; addenda use settlement reference and carry-forward totals.
- **Attachments/OCR:** ALTA-style settlement attachments may follow. Hard OCR includes stamps, wet signatures, negative credits, and duplex shadows.

### 5.4 Credit Report

- **Purpose/pages:** Present identity, bureau scores, tradelines, payments, inquiries, public records, alerts, and score factors; 10-60 pages.
- **Layouts:** Modern tri-merge dashboard; legacy monospaced merge; bureau-column comparison report.
- **Header/footer/type:** Vendor/case header with pull date; compliance and page footer; condensed sans-serif or monospaced detail type.
- **Tables/signatures/codes:** Score cards, summary, tradeline and payment-history grids; certification rather than borrower signature; report barcode/QR near case metadata.
- **Watermarks/legal/continuation:** Confidential/consumer-report watermark and permissible-purpose notices; repeated tradeline headers and continuation markers.
- **Attachments/OCR:** Fraud alerts and supplements attach by report ID. Challenges include payment-versus-balance columns, bureau abbreviations, duplicated merges, and dense status codes.

### 5.5 Paystub

- **Purpose/pages:** Verify current employment, compensation, pay period, deductions, YTD earnings, and net pay; 1-2 pages.
- **Layouts:** Payroll-provider grid; detachable check-stock analogue; employer portal statement.
- **Header/footer/type:** Employer/payroll identity and employee reference; payroll/legal footer; tabular sans-serif or monospaced amounts.
- **Tables/signatures/codes:** Current/YTD earnings and deductions, hours/rate, leave, direct-deposit summary; no signature normally; pay-advice barcode or inert QR.
- **Watermarks/legal/continuation:** Earnings-statement watermark where used; payroll disclaimer; overflow deduction/leave pages repeat pay identifiers.
- **Attachments/OCR:** Direct-deposit advice may attach. Hard variants use faint gray rules, folded stock, and column drift.

### 5.6 W-2

- **Purpose/pages:** Document annual wages and taxes by employer; 1-2 pages per year.
- **Layouts:** Boxed recipient-copy analogue; payroll-provider condensed form; mailer/perforated form.
- **Header/footer/type:** Tax year and form subtype; copy instructions and revision; compact sans-serif or OCR-friendly machine type.
- **Tables/signatures/codes:** Numbered boxes 1-20, employer/employee blocks; no routine signature; control number/barcode in upper or side margin.
- **Watermarks/legal/continuation:** Copy B/C labels and tax notices; state/local overflow uses continuation page.
- **Attachments/OCR:** Corrected-form notice may attach. Challenges include box association, perforation shadows, and state/local rows.

### 5.7 1099 Family

- **Purpose/pages:** Document contract, interest, dividend, retirement, and miscellaneous income; 1-2 pages per payer/form.
- **Layouts:** Federal box form; payer-generated condensed form; consolidated tax statement segment.
- **Header/footer/type:** Form subtype/year and payer/payee metadata; recipient-copy notice; compact box typography.
- **Tables/signatures/codes:** Subtype-specific numbered boxes; no standard signature; payer control number or barcode.
- **Watermarks/legal/continuation:** Corrected checkbox/watermark and tax-use notices; supplemental pages preserve payer/account identity.
- **Attachments/OCR:** Consolidated statements may bundle multiple 1099 types. OCR must identify subtype and avoid payer/payee inversion.

### 5.8 Bank Statement

- **Purpose/pages:** Establish ownership, statement period, balances, transactions, large deposits, and source of funds; 3-15 pages.
- **Layouts:** National-bank summary/detail; regional-bank ledger; credit-union combined statement; portal statement rescanned.
- **Header/footer/type:** Institution/account/period header; legal, contact, and page footer; branded sans-serif with monospaced or aligned numeric tables.
- **Tables/signatures/codes:** Account summaries, transaction ledgers, running balances, fees, check images; no signature; statement barcode or QR in header/footer.
- **Watermarks/legal/continuation:** Duplicate/copy watermark; deposit insurance and error-resolution language; repeated ledger headers and balance carry-forward.
- **Attachments/OCR:** Check images and notices attach. Hard variants include wrapped descriptions, negative signs, and mixed orientations.

### 5.9 Brokerage Statement

- **Purpose/pages:** Establish ownership, liquidity, holdings, market value, and transaction activity; 2-15 pages.
- **Layouts:** Portfolio dashboard; holdings-first statement; retirement/brokerage combined statement.
- **Header/footer/type:** Firm/account/period header; investment disclosures; polished sans-serif with dense numeric tables.
- **Tables/signatures/codes:** Portfolio summary, holdings, cost basis, activity, cash; no signature; account/document barcode and optional portal QR.
- **Watermarks/legal/continuation:** Duplicate statement watermark; investment-risk and SIPC-style synthetic disclosure; continuation repeats account and valuation date.
- **Attachments/OCR:** Prospectus notices may attach. OCR must distinguish market value, cost basis, vested balance, and cash.

### 5.10 Insurance Binder

- **Purpose/pages:** Evidence property coverage, insured, carrier, term, premium, deductible, and mortgagee; 1-5 pages.
- **Layouts:** Carrier binder; agency evidence letter; policy-declarations excerpt.
- **Header/footer/type:** Carrier/agency identity, binder/policy reference; producer and legal footer; business sans-serif or serif letter style.
- **Tables/signatures/codes:** Coverage and premium tables, mortgagee block, agent signature; policy barcode and optional payment QR.
- **Watermarks/legal/continuation:** Binder, evidence only, or cancellation warning; statutory disclaimer; endorsements attach with policy reference.
- **Attachments/OCR:** Invoice and replacement-cost worksheet may attach. OCR challenges include annual versus monthly premium and coverage-versus-value figures.

### 5.11 Purchase Agreement

- **Purpose/pages:** Establish parties, property, price, financing, deposits, concessions, contingencies, and closing; 8-30 pages.
- **Layouts:** State association contract analogue; brokerage e-contract; attorney-drafted agreement.
- **Header/footer/type:** Contract title, parties/property, paragraph numbering; initials/footer and form revision; legal serif or compact sans-serif.
- **Tables/signatures/codes:** Term boxes, addenda checklist, signature/initial blocks, notary where required; e-sign envelope barcode/QR.
- **Watermarks/legal/continuation:** Draft, executed, amended; legal notices; addenda and exhibits reference the controlling contract.
- **Attachments/OCR:** Disclosures, amendments, riders, and e-sign certificate attach. Hard variants include strikeouts, overwritten dates, and marginal initials.

### 5.12 Appraisal

- **Purpose/pages:** Support collateral characteristics, comparable analysis, condition, and value; 20-60 pages.
- **Layouts:** Uniform residential form analogue; desktop appraisal; field appraisal with photo/exhibit package.
- **Header/footer/type:** File/lender/subject metadata; appraiser certification and page footer; condensed form type with photo captions.
- **Tables/signatures/codes:** Subject/site/improvement fields, comparable grid, adjustment table, reconciliation, appraiser signature/license; report barcode and optional map QR.
- **Watermarks/legal/continuation:** Draft or final; independence/certification language; addenda repeat file/subject and identify superseding conclusions.
- **Attachments/OCR:** Photos, maps, sketches, licenses, and market data attach. OCR challenges center on signed adjustments, subject/comparable columns, and compressed exhibits.

### 5.13 Verification of Employment (VOE)

- **Purpose/pages:** Verify tenure, status, position, compensation, and continuance; 1-3 pages.
- **Layouts:** Written lender form; employer letter; third-party verification report; verbal-VOE worksheet.
- **Header/footer/type:** Employer/provider and employee/case header; verifier/legal footer; form sans-serif or professional-letter serif.
- **Tables/signatures/codes:** Employment and earnings sections, checkboxes, verifier signature/date; verification barcode/QR near case reference.
- **Watermarks/legal/continuation:** Confidential or verification-only; authorization language; overflow earnings page repeats employee and verification ID.
- **Attachments/OCR:** Payroll history may attach. Hard variants use handwriting, stamps, and fax headers.

### 5.14 Gift Letter

- **Purpose/pages:** Document donor, relationship, gift amount, source, transfer, property, and no repayment; 1-2 pages.
- **Layouts:** Lender form; donor letter; portal questionnaire.
- **Header/footer/type:** Lender/transaction header; certification footer; plain form or letter typography.
- **Tables/signatures/codes:** Donor/recipient/property blocks, transfer details, donor/borrower signatures; document barcode or e-sign QR.
- **Watermarks/legal/continuation:** Gift certification and no-repayment language; supplemental donor page repeats transaction reference.
- **Attachments/OCR:** Donor statements, transfer evidence, and borrower deposit attach. Handwriting and masked accounts drive OCR difficulty.

### 5.15 CPA Letter

- **Purpose/pages:** Support self-employment tenure, business ownership, or business-use funds; 1-3 pages.
- **Layouts:** Formal firm letterhead; accountant portal verification; signed factual certification.
- **Header/footer/type:** Firm identity/date/addressee/subject; credentials and disclaimer footer; professional serif or sans-serif.
- **Tables/signatures/codes:** Optional ownership or year summary; accountant signature/license; reference barcode rarely, QR only for synthetic verification portal.
- **Watermarks/legal/continuation:** Draft/copy where applicable; scope and reliance limitations; attachment pages repeat client/entity.
- **Attachments/OCR:** License or financial schedule may attach. OCR challenges include qualified language and multiple business entities.

### 5.16 Personal Tax Return

- **Purpose/pages:** Support personal income, deductions, tax liability, and linked schedules; 20-100 pages per year.
- **Layouts:** Preparation-software packet; government-form analogue; transcript-style output.
- **Header/footer/type:** Taxpayer/year/form header; preparation/e-file footer; compact government-form type.
- **Tables/signatures/codes:** Numbered lines, schedules, worksheets, signature/e-file authorization; submission barcode and form identifiers.
- **Watermarks/legal/continuation:** Client copy, draft, amended; statutory notices; schedules and statements repeat taxpayer/year/form.
- **Attachments/OCR:** W-2/1099 and worksheets may attach. OCR must manage line numbers, negative parentheses, and duplicate worksheet totals.

### 5.17 Business Tax Return

- **Purpose/pages:** Support entity income, ownership, balance sheet, compensation, and distributions; 30-200 pages.
- **Layouts:** Partnership, S-corporation, corporation, and transcript analogues.
- **Header/footer/type:** Entity/year/form header; preparer/e-file footer; compact tax typography.
- **Tables/signatures/codes:** Income statement, balance sheet, ownership, K-1 and supporting schedules; officer/e-file signatures; submission barcode.
- **Watermarks/legal/continuation:** Draft/client copy/amended; tax notices; entity/year carried through all schedules.
- **Attachments/OCR:** Depreciation and state returns attach. Hard variants add landscape schedules and multiple related entities.

### 5.18 Schedule C

- **Purpose/pages:** Present sole-proprietor revenue, expenses, and net profit; 2 pages plus schedules.
- **Layouts:** Government schedule analogue; tax-software worksheet; transcript extract.
- **Header/footer/type:** Taxpayer/business/year header; form/revision footer; numbered compact type.
- **Tables/signatures/codes:** Income, cost, expenses, vehicle, other expenses; no separate signature; form barcode.
- **Watermarks/legal/continuation:** Draft/client copy; tax notices; other-expense continuation repeats taxpayer/year.
- **Attachments/OCR:** Depreciation and detail statements attach. OCR focuses on line association and add-back candidates.

### 5.19 Schedule K-1

- **Purpose/pages:** Present entity ownership, pass-through income/loss, distributions, liabilities, and capital; 2-6 pages.
- **Layouts:** Partnership; S-corporation; beneficiary analogue; consolidated tax packet extract.
- **Header/footer/type:** Entity/recipient/year/form header; form notices; compact box typography.
- **Tables/signatures/codes:** Ownership and coded income boxes, capital/liability tables; no normal signature; form/control barcode.
- **Watermarks/legal/continuation:** Final/amended/client copy; code instructions; supplemental statements repeat entity/recipient.
- **Attachments/OCR:** Code statements attach. Challenges include entity matching, coded boxes, and negative/passive values.

### 5.20 Trust Document

- **Purpose/pages:** Establish trust identity, authority, trustees, beneficiaries, access, and restrictions; 10-100 pages.
- **Layouts:** Full agreement; certification of trust; amendment/restatement package.
- **Header/footer/type:** Legal title, trust date, parties; document/page/exhibit footer; legal serif.
- **Tables/signatures/codes:** Definitions, powers, schedules, trustee signatures and notary; recording barcode where applicable.
- **Watermarks/legal/continuation:** Draft/executed/certified copy; notarial and legal provisions; exhibits and amendments reference the controlling trust.
- **Attachments/OCR:** Schedules and recorded pages attach. Hard OCR includes seals, legal-size pages, and amendment precedence.

### 5.21 Rental Agreement

- **Purpose/pages:** Establish landlord, tenant, property, lease term, rent, deposits, and obligations; 3-20 pages.
- **Layouts:** Property-manager lease; attorney lease; portal e-lease.
- **Header/footer/type:** Parties/property/term header; initials and legal footer; legal serif or form sans-serif.
- **Tables/signatures/codes:** Rent/deposit/fee table, tenant/landlord signatures, initials, optional notary; e-sign barcode/QR.
- **Watermarks/legal/continuation:** Draft/executed/renewal; state notices; addenda reference lease/property/date.
- **Attachments/OCR:** Pet, parking, renewal, and inspection addenda attach. OCR must distinguish concessions and amended rent.

### 5.22 Lease Schedule

- **Purpose/pages:** Summarize multiple units, tenants, rents, terms, deposits, and occupancy; 1-5 pages.
- **Layouts:** Property-management rent roll; underwriting worksheet; owner-prepared schedule.
- **Header/footer/type:** Property/owner/as-of date; source/preparer footer; spreadsheet-like type.
- **Tables/signatures/codes:** Unit-by-unit grid and totals, preparer/reviewer signature; schedule barcode optional.
- **Watermarks/legal/continuation:** Draft/verified; reliance language; repeated headers and carry-forward totals.
- **Attachments/OCR:** Individual leases attach. Hard variants use landscape pages and handwritten vacancy notes.

### 5.23 HOA Document

- **Purpose/pages:** Establish dues, frequency, assessments, status, transfer fees, and project information; 1-20 pages.
- **Layouts:** Assessment certificate; management letter; ledger; project questionnaire; budget excerpt.
- **Header/footer/type:** Association/property/as-of date; management/legal footer; business sans-serif.
- **Tables/signatures/codes:** Dues/assessment/status tables, manager signature/stamp; property/account barcode and optional portal QR.
- **Watermarks/legal/continuation:** Resale certificate, draft, or paid status; reliance/expiration notice; attachments repeat association/property.
- **Attachments/OCR:** Budget, insurance, and ledger may attach. OCR must distinguish monthly/quarterly dues and special assessments.

### 5.24 Military Document

- **Purpose/pages:** Support service status, rank, dates, base pay, allowances, and orders; 1-20 pages.
- **Layouts:** Leave-and-earnings statement; statement of service; orders; military pay portal output.
- **Header/footer/type:** Service/member/date header; official notice/footer; monospaced or government sans-serif.
- **Tables/signatures/codes:** Entitlements/deductions, service details, command signature; document/control barcode.
- **Watermarks/legal/continuation:** Official use, copy, or orders status; government-style notices; continuation repeats member/order ID.
- **Attachments/OCR:** Orders and amendments attach. Challenges include abbreviations and recurring versus temporary allowances.

### 5.25 VA Document

- **Purpose/pages:** Support eligibility, entitlement, funding-fee status, and VA-specific certifications; 1-10 pages per document.
- **Layouts:** Eligibility certificate analogue; lender eligibility worksheet; veteran certification.
- **Header/footer/type:** Agency/member/reference header; eligibility/legal footer; government sans-serif.
- **Tables/signatures/codes:** Entitlement/service/fee fields, veteran/lender signatures; certificate barcode or inert verification QR.
- **Watermarks/legal/continuation:** Eligibility, restored, exempt, or superseded status; program notices; supplements repeat certificate ID.
- **Attachments/OCR:** Service evidence may attach. OCR must preserve entitlement and exemption semantics.

### 5.26 FHA Document

- **Purpose/pages:** Support case assignment, MIP, certifications, amendatory clauses, and FHA transaction requirements; 5-30 pages beyond the core file.
- **Layouts:** Case portal output; lender worksheet; borrower/seller certification; amendatory-clause form.
- **Header/footer/type:** Case/borrower/property header; program and form footer; government/form typography.
- **Tables/signatures/codes:** Case, MIP, loan, certification, and appraisal notice sections; signatures/initials; case barcode.
- **Watermarks/legal/continuation:** Draft/final/case-assigned; required program language; addenda repeat case number.
- **Attachments/OCR:** Appraisal notices and worksheets attach. Challenges include case consistency, MIP components, and checkbox certifications.

### 5.27 USDA Document

- **Purpose/pages:** Support property eligibility, household income, guarantee fee, and program certifications; 5-30 pages beyond the core file.
- **Layouts:** Eligibility portal; household-income worksheet; lender certification; underwriting findings analogue.
- **Header/footer/type:** Agency/case/household/property header; program footer; government sans-serif.
- **Tables/signatures/codes:** Household members/income, limits, fees, eligibility, signatures; case barcode/QR.
- **Watermarks/legal/continuation:** Preliminary/final eligibility; program notices; supplements repeat case/property.
- **Attachments/OCR:** Maps and eligibility printouts attach. OCR must distinguish household from qualifying income.

### 5.28 Employment Contract

- **Purpose/pages:** Establish binding employment terms, role, start date, compensation, location, and conditions; 3-15 pages.
- **Layouts:** Corporate agreement; executive contract; healthcare/academic appointment agreement.
- **Header/footer/type:** Employer/employee/effective-date header; legal page footer; professional/legal type.
- **Tables/signatures/codes:** Compensation/benefits, duties, contingencies, employer/employee signatures, optional notary; e-sign envelope ID/QR.
- **Watermarks/legal/continuation:** Draft/executed/confidential; governing-law and contingency language; exhibits reference agreement.
- **Attachments/OCR:** Compensation exhibits attach. Hard variants include redlines and amendments.

### 5.29 Offer Letter

- **Purpose/pages:** Establish offered role, start date, base pay, employment status, location, and contingencies; 1-5 pages.
- **Layouts:** HR letterhead; recruiting portal output; signed electronic offer.
- **Header/footer/type:** Employer/date/candidate/subject; HR contact/legal footer; professional sans-serif or serif.
- **Tables/signatures/codes:** Compensation summary and acceptance signatures; e-sign QR/envelope ID where applicable.
- **Watermarks/legal/continuation:** Draft/accepted/conditional; at-will and contingency language; attachments repeat candidate/offer date.
- **Attachments/OCR:** Benefits or incentive summaries attach. OCR must separate base salary from total target compensation.

### 5.30 Bonus Documentation

- **Purpose/pages:** Support bonus eligibility, history, frequency, trend, and continuance; 2-20 pages.
- **Layouts:** Employer plan; award letter; payroll history; underwriting worksheet.
- **Header/footer/type:** Employer/employee/plan period; policy/footer; mixed professional and spreadsheet type.
- **Tables/signatures/codes:** Bonus history, target/actual, YTD/prior years, manager/HR certification; document ID/barcode.
- **Watermarks/legal/continuation:** Confidential/estimated/final; discretionary language; schedules repeat employee/period.
- **Attachments/OCR:** Paystubs and award records attach. OCR must distinguish one-time, discretionary, and recurring amounts.

### 5.31 Commission Documentation

- **Purpose/pages:** Support commission plan, rate/tier, history, YTD earnings, and continuance; 2-20 pages.
- **Layouts:** Sales compensation plan; commission statement; payroll detail; averaging worksheet.
- **Header/footer/type:** Employer/employee/period/plan header; compensation/legal footer; spreadsheet and professional type.
- **Tables/signatures/codes:** Sales, rates, tiers, draws, chargebacks, payouts, signatures; statement barcode.
- **Watermarks/legal/continuation:** Preliminary/final/confidential; plan limitations; continuation carries employee/period totals.
- **Attachments/OCR:** Sales reports and paystubs attach. Challenges include rate-versus-dollar columns and negative chargebacks.

### 5.32 Large-Deposit Documentation

- **Purpose/pages:** Explain and trace a material deposit from origin through borrower receipt; 2-20 pages.
- **Layouts:** Evidence cover sheet; bank-ledger bundle; transfer confirmation; check/sale receipt plus LOE.
- **Header/footer/type:** Case/account/deposit reference; evidence footer; mixed issuer styles.
- **Tables/signatures/codes:** Deposit date/amount/source and document-linkage table; borrower/preparer signature as appropriate; evidence barcode.
- **Watermarks/legal/continuation:** Review/cleared/pending; certification language; each attachment labeled by evidence sequence.
- **Attachments/OCR:** Screenshots, checks, statements, and receipts are intrinsic. OCR must match dates, amounts, ownership, and transfer direction.

### 5.33 Source-of-Funds Package

- **Purpose/pages:** Demonstrate complete lineage for down payment, closing costs, reserves, or payoff funds; 3-30 pages.
- **Layouts:** Underwriting cover worksheet with ordered exhibits; settlement-source package; liquidation/transfer package.
- **Header/footer/type:** Transaction/borrower/source header; review/footer; mixed worksheet and issuer type.
- **Tables/signatures/codes:** Source/use reconciliation, transfer chain, account ownership, reviewer certification; package/exhibit barcode.
- **Watermarks/legal/continuation:** Pending/verified; no-borrowed-funds certification where relevant; attachments use exhibit markers.
- **Attachments/OCR:** Bank, brokerage, sale, gift, and transfer documents attach. Extreme variants test duplicate legs and partial screenshots.

### 5.34 Divorce Decree

- **Purpose/pages:** Establish ordered support, property/debt allocation, and effective terms; 10-80 pages.
- **Layouts:** Court order; incorporated settlement agreement; amended order.
- **Header/footer/type:** Court caption/case/parties; docket/page/footer; legal serif or court monospaced type.
- **Tables/signatures/codes:** Findings, ordered amounts/dates, judge/clerk signatures and seals; filing barcode.
- **Watermarks/legal/continuation:** Filed/certified copy; court notices; exhibits and amendments retain case ID.
- **Attachments/OCR:** Settlement schedules and payment histories attach. Challenges include proposed versus ordered terms and stamps over text.

### 5.35 Bankruptcy Document

- **Purpose/pages:** Establish chapter, filing/disposition, schedules, included debts, and plan obligations; 20-150 pages.
- **Layouts:** Petition packet; court docket/order; plan and schedule package.
- **Header/footer/type:** Court/district/case/debtor header; docket/form footer; government/legal type.
- **Tables/signatures/codes:** Creditor schedules, assets/liabilities, plan payments, debtor/attorney/judge signatures; case barcode.
- **Watermarks/legal/continuation:** Filed, discharged, dismissed, amended; court notices; every schedule retains case/debtor identity.
- **Attachments/OCR:** Creditor matrix and orders attach. OCR must distinguish discharged, reaffirmed, and continuing obligations.

### 5.36 Child-Support Document

- **Purpose/pages:** Establish support obligation or income, frequency, duration, arrears, and payment history; 2-50 pages.
- **Layouts:** Court order; agency payment ledger; settlement provision; employer withholding notice.
- **Header/footer/type:** Court/agency/case/parties header; legal/agency footer; legal serif or agency sans-serif.
- **Tables/signatures/codes:** Ordered payment, effective/termination dates, ledger, judge/agency signatures; case barcode.
- **Watermarks/legal/continuation:** Filed/certified/current; statutory notices; ledger continuation repeats case and running totals.
- **Attachments/OCR:** Payment history and amendments attach. Challenges include weekly/monthly conversion, arrears, and party attribution.

## 6. Visual Realism Standards

Every family must support deterministic page-level profiles for:

- Office scanner output, including feeder skew, edge shadow, streaks, duplex bleed, and mixed originals.
- Phone-camera scans, including perspective, lens distortion, glare, page curl, finger or desk shadow, and uneven illumination.
- Fax scans, including low resolution, header bands, line dropout, compression, and monochrome noise.
- Print-rescan and portal-rescan paths with multiple compression generations.
- Variable DPI, rotation, blur, grain, toner density, and color cast.
- Staple and hole-punch shadows, fold marks, creases, smudges, optional stains, and page wear.
- Highlighting, sticky notes, handwritten initials, corrections, wet signatures, and digital signatures.
- Watermarks, stamps, barcodes, QR codes, legal footers, and page-number artifacts.
- Mixed page quality within one file and mixed acquisition sources within one package.

Effects must remain plausible for the document's origin and must never repeat identically across pages. Difficulty must be controlled, not random corruption.

## 7. OCR Challenge Matrix

| Template family | Easy | Typical | Hard | Extreme |
|---|---|---|---|---|
| 1003 | Clean scan, typed fields | Mild skew, checkboxes, dense columns | Handwriting, faint continuation pages | Amendments, mixed quality, column drift, partial crops |
| Loan Estimate | Clean three-page disclosure | Rescan, light compression, checkboxes | Clipped margins, low-contrast totals | Mixed revisions and artifact-obscured cost columns |
| Closing Disclosure | Clean draft/final | E-sign marks and settlement stamp | Wet signatures, credits, duplex shadow | Corrected pages mixed with superseded versions |
| Credit report | Clear modern vendor layout | Dense tradelines and bureau abbreviations | Fax/monospaced report, broken tables | Long mixed report with duplicate merges and clipped columns |
| Paystub | Clear provider statement | Faint rules, current/YTD tables | Folded stock, column drift, small type | Screenshot-rescan with partial crop and multiple earning types |
| W-2 | Clear recipient copy | Perforation/fold shadows | Faint box rules and state rows | Multiple forms/corrections on mixed scans |
| 1099 | Clear single form | Mixed payer layouts | Consolidated statement segment | Multiple subtypes with clipped box labels |
| Bank statement | Clear summary/detail | Wrapped transactions, mild skew | Faxed ledger, check images, low contrast | Mixed DPI, cropped running balances, screenshot inserts |
| Brokerage statement | Clear portfolio summary | Dense holdings and activity | Landscape pages, compressed charts | Multi-account consolidated packet with partial pages |
| Insurance binder | Clear agency binder | Stamp/signature and small coverage table | Fax, handwriting, low contrast | Binder plus endorsements with conflicting visual hierarchy |
| Purchase agreement | Clean executed e-contract | Initials, signatures, addenda | Handwritten changes and crooked duplex scans | Amendments, strikeouts, missing/inserted pages |
| Appraisal | Clear form and photos | Dense comparable grid, compressed exhibits | Rotated maps, low-resolution photos | Mixed addenda, signed adjustments, severe grid degradation |
| VOE | Clean typed form | Fax header and checkboxes | Handwritten earnings, stamp overlap | Verbal/written forms mixed with conflicting dates |
| Gift letter | Clean lender form | Handwritten signatures and masks | Phone scan with shadow/glare | Mixed donor evidence and partially cropped transfer proof |
| CPA letter | Clean letterhead | Signature and scan noise | Fax/stamp and dense disclaimer | Multiple entity references and degraded attachments |
| Personal tax return | Clean software packet | Dense schedules and negatives | Rotated/faint schedules | Large mixed packet with duplicates and partial pages |
| Business return | Clean entity packet | Landscape balance sheets | Multiple entities and faint schedules | Very large mixed-year packet with page-order disruption |
| Schedule C | Clear two-page schedule | Small type and negative amounts | Faint line numbers, attachment detail | Multiple businesses and degraded continuation statements |
| K-1 | Clear form | Coded boxes and supplemental page | Negative/passive values, entity ambiguity | Multiple entities/years and clipped supplemental codes |
| Trust document | Clean certification | Legal text, signatures, notary | Legal-size scan, seals, amendments | Restatements and exhibits with degraded page ordering |
| Rental agreement | Clean e-lease | Initials and addenda | Handwritten amendments | Multiple leases/renewals with mixed execution quality |
| Lease schedule | Clean spreadsheet | Landscape grid and carry-forward | Handwritten vacancy notes | Cropped columns and leases with inconsistent visual sources |
| HOA document | Clean certificate | Management stamp and ledger | Faxed questionnaire, handwriting | Budget/ledger/certificate bundle with mixed DPI |
| Military document | Clear official output | Monospaced abbreviations | Faxed orders, stamps | Orders and amendments with mixed orientations |
| VA document | Clean certificate | Portal rescan and signatures | Faint entitlement fields | Superseded/restored certificates and degraded service evidence |
| FHA document | Clean case forms | Initials and checkboxes | Mixed lender/government scans | Case supplements with stamps, revisions, and clipped MIP fields |
| USDA document | Clean eligibility forms | Portal print and tables | Low-contrast household worksheet | Map/screenshots and mixed preliminary/final findings |
| Employment contract | Clean signed agreement | E-sign footer and exhibits | Scanned redlines and initials | Amendments with superseding compensation terms |
| Offer letter | Clean accepted offer | Signature and portal footer | Phone scan and faint compensation table | Conditional/revised offers mixed in one package |
| Bonus documentation | Clear award letter | History table and payroll evidence | Landscape worksheets and handwriting | Multiple plans/years with one-time and recurring awards |
| Commission documentation | Clear statement | Tiered tables and chargebacks | Dense landscape grids | Mixed systems, negative adjustments, and cropped rates |
| Large deposit | Clear cover and transfer | Screenshots plus statement evidence | Partial masks and mixed issuers | Duplicate transfer legs, cropped timestamps, mixed quality |
| Source of funds | Clear reconciliation package | Multiple institution exhibits | Liquidation/transfer chain with scans | Complex multi-hop lineage and intentionally missing link |
| Divorce decree | Clean certified order | Stamps and legal text | Handwritten docket notes | Amendments and proposed/final orders mixed together |
| Bankruptcy | Clean order and schedules | Dense creditor tables | Court scans, stamps, redactions | Large amended packet with degraded matrices and mixed status docs |
| Child support | Clean court order | Agency ledger and stamps | Handwritten terms and low contrast | Amended orders plus long ledger with frequency ambiguity |

Extreme profiles are reserved for declared Level 5 or focused stress tests. They must remain human-diagnosable and have complete ground truth.

## 8. Continuation and Attachment Rules

1. Continuation pages repeat the minimum identity required to prevent orphaning: document ID, borrower/entity, account/case, period/year, and page sequence.
2. Carried totals must identify whether they are page subtotals, prior-page balances, or final totals.
3. Addenda and amendments must identify the controlling document and whether they supplement or supersede it.
4. Attachments must have deterministic ordering and exhibit labels when the source document would normally use them.
5. Mixed orientation and page size are allowed only where realistic.
6. Blank reverse pages may be included only when explicitly part of the test manifest.
7. Missing, duplicate, or reordered pages are pack-level test conditions, not accidental generator behavior.

## 9. Template Governance

All future generators must use:

1. `ENTERPRISE_DOCUMENT_BIBLE.md` for constitutional quality, realism, consistency, and validation rules.
2. This Template Library for approved document families, variants, components, and OCR profiles.
3. `ENTERPRISE_INSTITUTION_LIBRARY.md` for issuer identity, category, and layout bindings.

No generator may invent a new production-facing layout outside these specifications without first updating the constitutional references, assigning stable versions, defining OCR profiles, and adding validation coverage. Generator-local templates, undocumented one-off layouts, and copied real-institution forms are prohibited.

