# Velocity Enterprise Institution Library

Status: Permanent architectural reference  
Governing authority: `docs/ENTERPRISE_DOCUMENT_BIBLE.md`  
Companion reference: `docs/ENTERPRISE_TEMPLATE_LIBRARY.md`  

## 1. Mission

The Velocity Enterprise Institution Library defines the institution families, synthetic visual identities, layout portfolios, legal-language styles, and OCR characteristics available to future mortgage-document generators. It ensures that validation packages represent the diversity of production mortgage ecosystems rather than repeating one generic bank, payroll provider, insurer, credit vendor, or lender.

The library models industry categories and structural conventions. It does not authorize impersonation of a real institution. Names such as Bank of America, Chase, PNC, Wells Fargo, Capital One, Citizens, Huntington, Navy Federal, USAA, Fifth Third, and KeyBank identify diversity benchmarks and market-layout categories only. Released synthetic documents must use clearly fictional identities, original brand analogues, inert contact information, and noninfringing visual systems. Real logos, trademarks, routing numbers, domains, policy numbers, barcodes, signatures, or proprietary forms must not be reproduced.

## 2. Institution Record Contract

Every institution record must define:

- Stable institution-family and institution IDs.
- Category and supported subcategories.
- Synthetic legal name, display names, addresses, domains, phones, and identifiers.
- Geographic footprint and plausible products/services.
- Visual-identity system and permitted logo constructions.
- Header hierarchy and logo-placement rules.
- Color-palette roles with print/grayscale behavior.
- Typography roles and fallbacks.
- Table, statement, form, callout, and disclosure conventions.
- Footer, legal-language, contact, and accessibility conventions.
- Page-numbering and document-reference conventions.
- Typical page counts by supported template family.
- Barcode, QR-code, watermark, stamp, and signature conventions.
- Easy, typical, hard, and extreme OCR characteristics.
- At least two materially distinct layout versions; high-volume categories require three or more.
- Supported acquisition profiles and deterministic artifact constraints.
- Institution/template compatibility map.
- Effective date range and retirement/supersession rules.

Institution records supply presentation behavior. They may not own borrower, transaction, underwriting, or mathematical truth.

## 3. Synthetic Visual-Identity Rules

### 3.1 Names and marks

- Use fictional names that are not confusingly similar to a real institution in the same category and region.
- Use original geometric, typographic, or abstract logo analogues.
- Do not imitate a real institution's distinctive symbol, wordmark, slogan, or trade dress.
- Maintain stable identity across documents issued by the same synthetic institution.
- Support historical identity revisions through explicit versioning rather than accidental drift.

### 3.2 Logo placement

Each layout declares one of these patterns:

- Upper-left masthead with account/document metadata to the right.
- Centered institutional masthead with metadata below.
- Compact upper-right mark paired with a strong document title.
- Vertical side-band identity for statements or portal exports.
- Monochrome legacy/fax identity with text-only fallback.

The same institution must use more than one placement pattern across materially different layout generations.

### 3.3 Color guidance

- Define primary, secondary, neutral, alert, positive, and disclosure colors.
- Ensure critical distinctions survive grayscale scanning.
- Avoid relying on color alone for checkbox, status, or total meaning.
- Support monochrome, low-toner, fax, and color-camera acquisition profiles.
- Avoid palettes that intentionally mimic one real institution's distinctive brand combination.

### 3.4 Typography

- Define display, body, label, numeric, legal, and machine-readable roles.
- Support modern sans-serif, traditional serif, condensed statement, and monospaced legacy variants where appropriate.
- Numeric tables require stable alignment and distinguishable punctuation.
- Font fallback must preserve field fit and table boundaries.

## 4. Institution Categories

### 4.1 Major national banks

- **Identity:** Mature multi-product brand analogue with nationwide tone, strong accessibility, and formal disclosures.
- **Headers/logo:** Prominent masthead on summary pages; compact mark on continuation pages; account and period metadata aligned opposite.
- **Palette/type:** Restrained two-color system plus neutrals; modern sans-serif with tabular numerals.
- **Tables/footer/pages:** Summary cards followed by dense transaction tables; extensive deposit-insurance, error-resolution, privacy, and service footers; page x of y plus statement ID; typically 4-15 pages.
- **Legal language:** Formal, standardized, product-specific, and highly versioned.
- **OCR:** Clean portals at easy level; print-rescan, check images, wrapped descriptions, and dense legal text at typical/hard levels.
- **Required variants:** Retail checking, combined deposit, mortgage servicing, legacy acquired-bank, and portal redesign.
- **Diversity benchmarks:** Layout portfolios should collectively cover structural patterns seen across Bank of America, Chase, Wells Fargo, Capital One, and similarly scaled institutions without copying them.

### 4.2 Regional banks

- **Identity:** Multi-state or concentrated regional brand analogue with relationship-banking tone.
- **Headers/logo:** Medium masthead, branch/service contacts, occasional regional imagery.
- **Palette/type:** Distinctive but nonimitative regional colors; business sans-serif or serif/sans combination.
- **Tables/footer/pages:** Conventional statement ledger, fee summary, marketing panel, branch footer; page numbering may restart by account; 3-12 pages.
- **Legal language:** State-aware notices and regional service language.
- **OCR:** More layout variation, statement inserts, and legacy systems than national-bank profiles.
- **Required variants:** Modern statement, legacy core-system statement, business account, and acquisition-transition layout.
- **Diversity benchmarks:** Patterns should span structures associated with PNC, Citizens, Huntington, Fifth Third, KeyBank, and comparable regional institutions.

### 4.3 Credit unions

- **Identity:** Member-owned cooperative analogue, community or affinity positioning, member-number vocabulary.
- **Headers/logo:** Friendly masthead, membership/contact panel, often combined-account summary.
- **Palette/type:** Community-oriented colors; approachable sans-serif with clear numeric tables.
- **Tables/footer/pages:** Share/checking/savings subaccounts, combined balances, dividend fields, NCUA-style synthetic disclosure; 2-10 pages.
- **Legal language:** Membership, share insurance, and error-resolution terminology.
- **OCR:** Multiple subaccounts, suffixes, combined summaries, and older core-system printouts.
- **Required variants:** Community CU, employer/association CU, military-affinity analogue, and modern digital CU.
- **Diversity benchmarks:** Must cover structural diversity associated with Navy Federal, large military-member institutions, local credit unions, and digital credit unions without copying real brands.

### 4.4 Digital and direct banks

- **Identity:** App-first, low-branch, modern synthetic institution.
- **Headers/logo:** Minimal mark, strong account card, generated timestamp, support URL analogue.
- **Palette/type:** High-contrast modern palette and geometric sans-serif.
- **Tables/footer/pages:** Compact summaries, card-based transactions, short legal footer; typically 2-8 pages.
- **Legal language:** Electronic delivery, partner-bank, and digital-service language.
- **OCR:** Screenshot-to-PDF, mobile crops, infinite-scroll print artifacts, and sparse page headers.
- **Required variants:** Mobile statement, formal downloadable statement, and partner-bank disclosure layout.

### 4.5 Brokerage and investment firms

- **Identity:** Trustworthy financial-services analogue with investment-focused hierarchy.
- **Headers/logo:** Firm/account/period masthead; advisor/service panel; compact continuation header.
- **Palette/type:** Conservative blue, green, charcoal, or burgundy analogues; polished sans-serif with tabular numerals.
- **Tables/footer/pages:** Portfolio summary, holdings, activity, cost basis, allocation, and lengthy investment disclosures; 4-20 pages.
- **Legal language:** Market-risk, valuation, brokerage protection, and tax-lot language.
- **OCR:** Dense holdings, negative market changes, multiple account registrations, and landscape inserts.
- **Required variants:** Full-service brokerage, discount brokerage, retirement platform, and managed-account statement.

### 4.6 Retirement plan administrators

- **Identity:** Employer-plan or third-party-administrator analogue.
- **Headers/logo:** Plan sponsor and administrator co-brand regions; participant/plan/date metadata.
- **Palette/type:** Corporate neutrals and sponsor accent; clear sans-serif.
- **Tables/footer/pages:** Vested/total balances, contributions, loans, allocations, and plan notices; 2-12 pages.
- **Legal language:** Vesting, withdrawal, loan, tax, and plan-document limitations.
- **OCR:** Vested-versus-total values, loan balances, and multiple contribution sources.
- **Required variants:** 401(k), pension, 403(b), and government-plan analogues.

### 4.7 Payroll providers

- **Identity:** Enterprise payroll-platform analogue serving many employers.
- **Headers/logo:** Provider mark secondary to employer; employee/pay-date/pay-period control strip.
- **Palette/type:** Neutral platform palette; compact sans-serif and tabular numeric font.
- **Tables/footer/pages:** Current/YTD earnings, taxes, deductions, leave, direct deposit, payroll notices; 1-2 pages.
- **Legal language:** Advice-only and employer-contact notices.
- **OCR:** Employer/provider separation, current/YTD column drift, earning codes, and small deduction rows.
- **Required variants:** Enterprise grid, small-business check stock, mobile portal, and legacy payroll export.

### 4.8 Employer-native payroll systems

- **Identity:** Employer-first statement without prominent third-party provider.
- **Headers/logo:** Employer letterhead or HR-system banner; employee and payroll metadata.
- **Palette/type:** Employer-bound palette and corporate type.
- **Tables/footer/pages:** Custom earnings/deduction ordering; 1-3 pages.
- **Legal language:** Employer payroll/HR contact and confidentiality language.
- **OCR:** Highly variable labels, bonus/commission rows, and custom leave units.
- **Required variants:** Corporate, healthcare, education/government, and small-employer formats.

### 4.9 Insurance carriers

- **Identity:** Regulated property/casualty carrier analogue with stability-focused brand.
- **Headers/logo:** Carrier masthead, policy/binder reference, agent/service panel.
- **Palette/type:** Conservative palette, strong coverage headings, readable legal type.
- **Tables/footer/pages:** Coverage, limits, deductibles, premium, endorsements, mortgagee, notices; 2-20 pages depending on binder/policy.
- **Legal language:** Binder limitations, cancellation, coverage exclusions, and state notices.
- **OCR:** Coverage versus premium values, endorsements, mortgagee clauses, and agency stamps.
- **Required variants:** Direct carrier, independent-agent carrier, high-value home, and regional mutual analogue.

### 4.10 Insurance agencies

- **Identity:** Local or regional agency analogue representing one or more carriers.
- **Headers/logo:** Agency masthead with carrier panel; agent contact and license region.
- **Palette/type:** Professional letterhead with carrier-neutral tables.
- **Tables/footer/pages:** Evidence/binder summary, invoice, mortgagee, signature; 1-5 pages.
- **Legal language:** Agency authority and evidence-only disclaimer.
- **OCR:** Fax headers, handwritten policy data, stamps, and mixed carrier/agency identities.
- **Required variants:** Local independent, regional brokerage, and portal-generated evidence.

### 4.11 Title companies

- **Identity:** Legal/real-estate services analogue emphasizing accuracy and locality.
- **Headers/logo:** Title/escrow masthead, order/property/parties metadata.
- **Palette/type:** Conservative serif/sans combination and muted colors.
- **Tables/footer/pages:** Commitment schedules, requirements, exceptions, legal descriptions, fee statements; 10-80 pages.
- **Legal language:** Commitment conditions, exclusions, recording, and jurisdiction-specific notices.
- **OCR:** Legal descriptions, schedule linkage, recording stamps, and mixed legal-size pages.
- **Required variants:** National underwriter agent, regional title firm, attorney-title office, and digital title platform.

### 4.12 Settlement and escrow companies

- **Identity:** Transaction-coordination analogue with escrow/trust emphasis.
- **Headers/logo:** Escrow/order/property/closing metadata; settlement contact.
- **Palette/type:** Neutral professional palette; clear sans-serif tables.
- **Tables/footer/pages:** Deposit receipt, payoff, wire/escrow status, settlement summary, certifications; 1-20 pages.
- **Legal language:** Trust-account, wire-fraud, escrow, and reliance notices.
- **OCR:** Cash-to-close amounts, credits, trust receipts, stamps, and wet signatures.
- **Required variants:** Independent settlement, attorney closing, title-affiliated escrow, and e-closing platform.

### 4.13 Mortgage lenders and banks

- **Identity:** Retail lender, depository lender, direct lender, or correspondent analogue.
- **Headers/logo:** Lender/loan-number/borrower/property header; originator contact where relevant.
- **Palette/type:** Accessible financial palette; disclosure-safe sans-serif.
- **Tables/footer/pages:** Application supplements, disclosures, worksheets, conditions, and notices; page counts follow template family.
- **Legal language:** Equal-housing, licensing, servicing, disclosure, and authorization language.
- **OCR:** Repeated loan values across many forms, e-sign footers, and mixed internal/external pages.
- **Required variants:** Depository retail, independent mortgage bank, direct digital lender, correspondent/wholesale, and legacy LOS output.

### 4.14 Mortgage brokers

- **Identity:** Local/regional advisory analogue with lender-neutral presentation.
- **Headers/logo:** Broker/contact/license masthead; borrower/property/loan metadata.
- **Palette/type:** Professional small-firm palette; business sans-serif.
- **Tables/footer/pages:** Intake forms, fee disclosures, comparison worksheets, authorization; 1-15 pages.
- **Legal language:** Broker role, compensation, licensing, and lender-selection notices.
- **OCR:** Handwritten intake, stamps, mixed lender attachments, and faxed forms.
- **Required variants:** Local boutique, regional multi-branch, online marketplace, and wholesale portal export.

### 4.15 Mortgage servicers

- **Identity:** Payment/account-management analogue distinct from origination lender.
- **Headers/logo:** Servicer/account/property/statement period; payment and support panels.
- **Palette/type:** Operational neutral palette; clear payment tables.
- **Tables/footer/pages:** Payment breakdown, escrow analysis, transaction history, payoff or verification; 2-20 pages.
- **Legal language:** Servicing, dispute, escrow, and debt-collection notices where appropriate.
- **OCR:** Principal/interest/escrow columns, suspense amounts, payment histories, and transferred-servicer branding.
- **Required variants:** Bank servicer, independent servicer, subservicer, and transferred-loan legacy statement.

### 4.16 Appraisal firms

- **Identity:** Licensed valuation-firm analogue with appraiser-centric credentials.
- **Headers/logo:** Firm/file/subject/lender metadata; appraiser identity and license.
- **Palette/type:** Restrained professional palette; form-compatible condensed typography.
- **Tables/footer/pages:** Uniform appraisal forms, grids, photo pages, maps, certifications; 20-60 pages.
- **Legal language:** Independence, scope, certification, limiting conditions.
- **OCR:** Comparable-grid adjustments, photo captions, license data, and mixed-color exhibits.
- **Required variants:** Independent appraiser, regional firm, appraisal-management-company output, desktop/hybrid appraisal.

### 4.17 Credit vendors

- **Identity:** Data/verification vendor analogue with compliance-heavy presentation.
- **Headers/logo:** Report ID, requester, borrower, pull date, vendor metadata.
- **Palette/type:** High-density neutral palette; condensed sans-serif or monospaced detail.
- **Tables/footer/pages:** Scores, tradelines, inquiry/public-record sections, alerts, notices; 10-60 pages.
- **Legal language:** Permissible purpose, consumer-report, dispute, and data-source notices.
- **OCR:** Bureau abbreviations, merged duplicates, status codes, score and payment ambiguity.
- **Required variants:** Modern tri-merge, legacy merge, bureau-comparison, and supplement/rescore report.

### 4.18 Verification vendors

- **Identity:** Employment, income, asset, rent, or fraud-verification platform analogue.
- **Headers/logo:** Verification type, report ID, subject, requester, generated date.
- **Palette/type:** Technology-neutral palette; clean sans-serif and data cards.
- **Tables/footer/pages:** Source records, verification findings, period history, confidence/status; 2-30 pages.
- **Legal language:** Source, authorization, permitted use, limitations, and expiration.
- **OCR:** Repeated employer/account sources, portal print artifacts, and status semantics.
- **Required variants:** Employment/income, asset, rent, and fraud/identity verification outputs.

### 4.19 Property management companies

- **Identity:** Residential-management analogue serving owners, tenants, and HOAs.
- **Headers/logo:** Company/property/unit/owner/as-of date; manager contact.
- **Palette/type:** Practical business palette; readable sans-serif.
- **Tables/footer/pages:** Rent rolls, ledgers, lease status, HOA certificates, budgets; 1-20 pages.
- **Legal language:** Management authority, reliance, expiration, and fee notices.
- **OCR:** Unit/tenant rows, monthly/annual totals, handwritten manager notes, and stamps.
- **Required variants:** Multifamily manager, single-family manager, HOA manager, and portal ledger.

### 4.20 Homeowners associations

- **Identity:** Community-association analogue, often paired with management company.
- **Headers/logo:** Association/property/account/as-of date; board or manager contact.
- **Palette/type:** Community or legal-certificate style.
- **Tables/footer/pages:** Dues, assessments, status, transfer fees, budget or questionnaire; 1-20 pages.
- **Legal language:** Certificate expiration, assessment authority, governing-document references.
- **OCR:** Monthly versus quarterly dues, special assessments, handwritten certification, and fax quality.
- **Required variants:** Self-managed association, professionally managed association, condominium association, and master/sub-association package.

### 4.21 Government agencies

- **Identity:** Synthetic federal/state/local agency analogue with neutral official styling.
- **Headers/logo:** Agency/program/form/case metadata; official title and revision.
- **Palette/type:** Government sans-serif or serif, restrained color, strong monochrome support.
- **Tables/footer/pages:** Numbered forms, certifications, eligibility, orders, notices; variable by program.
- **Legal language:** Statutory authority, privacy, burden, appeal, and certification notices.
- **OCR:** Dense forms, case identifiers, stamps, checkbox fields, and portal scans.
- **Required variants:** Federal form, state agency, local program, military/benefits, and portal output.

### 4.22 County recorders and courts

- **Identity:** Synthetic jurisdictional public-record analogue.
- **Headers/logo:** Court/recorder/jurisdiction/case or instrument metadata.
- **Palette/type:** Monochrome official style; legal serif, monospaced docket, or form sans-serif.
- **Tables/footer/pages:** Recording data, legal descriptions, captions, docket entries, orders, stamps; 1-150 pages.
- **Legal language:** Certification, filing, recording, service, appeal, and clerk notices.
- **OCR:** Stamps over text, seals, legal-size pages, marginal recording data, and redactions.
- **Required variants:** County recorder, state court, federal bankruptcy court, family court, and electronic docket output.

### 4.23 Employers - corporate and professional

- **Identity:** Synthetic employer analogue by industry and size.
- **Headers/logo:** Corporate letterhead, HR/payroll contact, employee metadata.
- **Palette/type:** Industry-appropriate original identity; professional typography.
- **Tables/footer/pages:** VOE, offer, contract, compensation, bonus/commission, payroll history; 1-20 pages.
- **Legal language:** Employment status, confidentiality, at-will/contract, compensation limitations.
- **OCR:** Employer/payroll-provider overlap, signatures, and compensation tables.
- **Required variants:** Technology, healthcare, financial/professional services, manufacturing, retail, education, government, and nonprofit.

### 4.24 Employers - small business and self-employed entities

- **Identity:** Synthetic local-business, professional-practice, trade, or family-business analogue.
- **Headers/logo:** Simpler letterhead, owner/contact information, business/entity metadata.
- **Palette/type:** Modest original identity; office-suite typography.
- **Tables/footer/pages:** Employment letters, contracts, P&L, invoices, payroll summaries; 1-30 pages.
- **Legal language:** Entity status, factual certification, and scope limitations.
- **OCR:** Inconsistent office formatting, stamps, handwriting, and mixed accounting attachments.
- **Required variants:** Sole proprietor, partnership, S-corporation, professional practice, contractor/trade, and family business.

## 5. Mandatory Institution Diversity

### 5.1 Portfolio minimums

- Major-bank analogue: at least 5 synthetic institutions, each with 3 statement generations.
- Regional-bank analogue: at least 6 institutions, each with 3 layouts.
- Credit union: at least 6 institutions across community, affinity, military, and digital types, each with 3 layouts.
- Brokerage/retirement: at least 5 institutions, each with 3 layouts.
- Payroll: at least 6 provider families and 4 employer-native families, each with 3 layouts.
- Insurance: at least 6 carrier and 4 agency families, each with 2 or more layouts.
- Title/settlement: at least 5 title and 5 settlement families, each with 2 or more layouts.
- Mortgage: at least 6 lender, 4 broker, and 4 servicer families, each with 3 layouts.
- Appraisal: at least 5 firm/AMC families, each with 2 or more layouts.
- Credit/verification: at least 5 credit and 4 verification vendors, each with 3 layouts.
- Property/HOA: at least 5 management and 5 association families, each with 2 or more layouts.
- Employers: at least 20 employer identities spanning all defined sectors, with multiple HR/payroll document styles.

### 5.2 Real-market benchmark coverage

The aggregate library must demonstrate structural diversity comparable to the market breadth represented by Bank of America, Chase, PNC, Wells Fargo, Capital One, Citizens, Huntington, Navy Federal, USAA, Fifth Third, KeyBank, community credit unions, major payroll platforms, brokerage firms, insurance carriers, title underwriters, appraisal vendors, credit-report providers, and mortgage lenders.

These names are benchmarks only. Synthetic releases must not use their names or protected identities.

### 5.3 Layout independence

An institution has multiple layouts only when variants differ in at least four of these dimensions:

- Header hierarchy or logo placement.
- Section order and summary architecture.
- Table structure and column vocabulary.
- Typography system.
- Page size/orientation or pagination.
- Footer/legal structure.
- Continuation behavior.
- Barcode/QR/document-reference placement.
- Portal versus statement versus legacy acquisition origin.

Color changes alone do not create a new layout.

## 6. Institution-to-Template Binding

Institution records must declare allowed template families. Examples:

- Banks and credit unions: bank statements, asset verifications, deposit receipts, payoff/servicing evidence.
- Brokerage firms: brokerage and retirement statements, liquidation evidence, transfer confirmations.
- Payroll providers and employers: paystubs, VOEs, contracts, offers, bonus and commission records.
- Insurers/agencies: binders, declarations, invoices, replacement-cost evidence.
- Title/settlement: title commitments, earnest-money receipts, source-of-funds confirmations, Closing Disclosures, settlement summaries.
- Mortgage companies: applications, Loan Estimates, Closing Disclosures, disclosures, worksheets, conditions, servicing statements.
- Appraisal firms: appraisal forms, addenda, photos, maps, review certificates.
- Credit/verification vendors: credit reports, supplements, employment/income/asset verification reports.
- Property managers/HOAs: leases, schedules, ledgers, assessment certificates, questionnaires, budgets.
- Government/courts/recorders: tax forms, program documents, military/VA/FHA/USDA forms, court orders, bankruptcy, recorded instruments.

A binding must select an approved template variant and institution layout version. Renderers may not combine arbitrary components in ways the binding does not authorize.

## 7. OCR Characteristics by Institution Generation

Every institution supports four controlled generations:

1. **Easy:** High-resolution clean scan or clearly rendered portal statement; stable tables and strong contrast.
2. **Typical:** Normal office scan or print-rescan; mild skew/compression; ordinary stamps, signatures, wrapped rows, and continuation pages.
3. **Hard:** Fax, phone camera, low toner, handwriting, mixed orientation, clipped margins, or degraded tables while remaining human-readable.
4. **Extreme:** Controlled mixed-quality packet, legacy/current layout collision, amendments, partial pages, or severe artifacts reserved for declared stress testing.

Institution-specific OCR metadata must include expected label aliases, numeric styles, account masks, date formats, continuation patterns, and common visual ambiguities. It must not provide a hidden perfect text layer to the OCR system under test.

## 8. Reusable Institution Components

- Original logo/wordmark analogue and monochrome fallback.
- Institution name/address/contact block.
- Branch, agent, advisor, appraiser, originator, or verifier block.
- Account, case, policy, loan, order, or report metadata strip.
- Service/contact and dispute-information footer.
- Legal/disclosure module by category and jurisdiction analogue.
- Page-number and document-reference component.
- Synthetic barcode and inert QR component.
- Draft/copy/status watermark.
- Signature, credential, license, stamp, seal, and notary component.
- Institution-specific table header, total row, alert, and callout styles.
- Portal-generated timestamp and print-source footer.

Components are versioned within the institution family and must preserve grayscale readability.

## 9. Safety, Authenticity, and Legal Constraints

1. All institution names, identities, contacts, identifiers, barcodes, QR payloads, credentials, and signatures must be synthetic.
2. Real-institution examples are category benchmarks, not approved release identities.
3. Do not reproduce real logos, proprietary forms, routing/account numbers, government seals, or verification endpoints.
4. Do not create documents capable of passing as negotiable instruments, valid identification, valid insurance, genuine credit reports, or executable closing documents.
5. Every released page must carry an unobtrusive but durable synthetic-validation indicator.
6. Synthetic contact domains must be inert or reserved for testing.
7. Institution diversity must not undermine cross-document scenario consistency.

## 10. Versioning and Lifecycle

Every institution and layout version records:

- Institution-library revision.
- Institution family and category.
- Identity version.
- Layout version and supported effective date range.
- Template-family compatibility.
- Typography, palette, component, legal, and artifact versions.
- Supported OCR levels.
- Deterministic generation seed inputs.
- Status: draft, active, deprecated, or retired.

Released validation packs pin exact versions. Updating an institution layout must not silently change an existing pack. Retired layouts remain reproducible for historical acceptance tests.

## 11. Governance

All future generators must jointly comply with:

1. `ENTERPRISE_DOCUMENT_BIBLE.md`.
2. `ENTERPRISE_TEMPLATE_LIBRARY.md`.
3. This Institution Library.

No generator may invent an institution identity, logo system, layout, legal footer, or issuer-specific document behavior outside these references without first updating the permanent specifications, assigning versions, establishing template bindings, and adding visual, consistency, OCR, and safety validation requirements.

