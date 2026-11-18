# Software Requirements Specification (SRS)
## NSFAS Living Allowance Compliance & Audit Engine

**Document Version:** 1.0  
**Status:** Draft for Engineering & Architecture Review  
**Target Stack:** Gemini API (Multimodal Document Understanding + Structured JSON Outputs)

---

## 1. Introduction

### 1.1 Purpose
This Software Requirements Specification (SRS) defines the functional, non-functional, and data-schema requirements for the **NSFAS Living Allowance Compliance & Audit Engine**. The application ingests student bank or digital wallet statements (PDF/images), leverages the **Gemini API** to extract and classify line-item transactions against Department of Higher Education and Training (DHET) and National Student Financial Aid Scheme (NSFAS) bursary guidelines, and produces an automated compliance determination (`COMPLIANT`, `FLAGGED_REVIEW`, or `NON_COMPLIANT`) alongside a category spending breakdown.

### 1.2 Scope
The system is designed for financial aid administrators, institutional bursary officers, and student financial wellness advisors. It automates the manual auditing of student allowance statements by:
1. Ingesting multi-page PDF or scanned bank statements.
2. Performing multimodal OCR, table extraction, and merchant classification via the Gemini API.
3. Enforcing deterministic business rules over AI-extracted classifications to detect prohibited spending (e.g., gambling/betting, alcohol, tobacco, unauthorized third-party transfers).
4. Rendering an interactive audit dashboard with spending breakdowns, flagged transaction evidence, and downloadable audit reports.

### 1.3 Definitions, Acronyms, and Abbreviations
* **NSFAS:** National Student Financial Aid Scheme (South Africa).
* **DHET:** Department of Higher Education and Training.
* **POS:** Point of Sale.
* **POPIA:** Protection of Personal Information Act (South Africa).
* **SRS:** Software Requirements Specification.
* **Structured Outputs:** Gemini API capability enforcing strict adherence to a provided JSON Schema (`response_schema`).

---

## 2. Overall Description

### 2.1 System Architecture & Data Flow
1. **Ingestion Layer:** User uploads a statement (PDF, PNG, JPEG) via web interface or API.
2. **Pre-Processing & PII Redaction (Optional/Configurable):** Strips or masks sensitive account numbers prior to logging while retaining transaction rows for Gemini analysis.
3. **Gemini API Document Analysis:** Sends the document via the Gemini File API (or inline base64 for small files) using `gemini-2.5-pro` or `gemini-2.5-flash` with a system prompt encoding NSFAS allowance rules and a strict JSON `response_schema`.
4. **Deterministic Rule & Verification Engine:** Validates mathematical reconciliation ($\text{Opening Balance} + \sum \text{Credits} - \sum \text{Debits} = \text{Closing Balance}$), applies threshold triggers, and calculates compliance scores.
5. **Presentation & Audit Layer:** Displays category breakdowns, monthly allowance utilization ($R1,760.00$/month baseline), and highlighted red-flag transactions.

### 2.2 User Classes and Characteristics
* **Bursary Compliance Officer:** Reviews flagged student accounts, exports audit evidence, and overrides false positives with audit notes.
* **System Administrator:** Configures permissible/prohibited merchant keyword overrides, allowance caps, and API rate limits.
* **Student / Financial Advisor (Self-Check Mode):** Uploads statements to verify allowance spending health and budget allocation.

---

## 3. Specific Requirements

### 3.1 Functional Requirements

#### FR-1: Statement Ingestion & Validation
* **FR-1.1:** The system shall accept bank statements in `.pdf`, `.png`, and `.jpg` formats up to 25 MB per file.
* **FR-1.2:** The system shall support multi-page statements spanning up to 12+ months of ledger history.
* **FR-1.3:** The system shall reject corrupted, password-protected, or unreadable files with clear user error messaging.

#### FR-2: Gemini API Extraction & Classification
* **FR-2.1:** The system shall invoke the Gemini API using native PDF multimodal understanding (avoiding brittle regex-only text scrapers) to parse multi-column transaction tables accurately.
* **FR-2.2:** For every transaction row, the Gemini model shall extract:
  * `date` (ISO-8601 `YYYY-MM-DD` or `DD/MM` normalized)
  * `raw_description` (exact merchant/ledger string)
  * `normalized_merchant` (cleaned merchant entity name, e.g., `"Hollywoodbets"`, `"Tops at SPAR"`, `"Shoprite"`)
  * `transaction_type` (`CREDIT`, `DEBIT`, `FEE`)
  * `amount_zar` (numeric float)
  * `running_balance_zar` (numeric float, if present)
  * `category` (enumerated taxonomy)
  * `compliance_status` (`PERMISSIBLE`, `PROHIBITED`, `WARNING_REVIEW`)
  * `flag_reason` (concise explanation citing the relevant NSFAS guideline if non-permissible)
  * `confidence_score` (float `0.0` to `1.0`)

#### FR-3: NSFAS Policy Taxonomy & Flagging Rules
* **FR-3.1 Permissible Categories:**
  * `FOOD_GROCERIES`: Supermarkets, fresh produce, campus cafeterias.
  * `PERSONAL_CARE_HYGIENE`: Pharmacies, toiletries, sanitary products, basic household cleaning.
  * `ACADEMIC_DATA_PRINTING`: Mobile data bundles, stationery, campus printing/binding.
  * `LOCAL_COMMUTE`: Municipal buses, commuter rail/smartcards, local public transit.
  * `BANK_FEES`: Standard monthly account maintenance or POS fees.
  * `NSFAS_DISBURSEMENT`: Incoming NSFAS / institutional allowance credits.
* **FR-3.2 Prohibited Categories (Automatic Flag Triggers):**
  * `GAMBLING_BETTING`: Online sportsbooks, casinos, lottery operators (e.g., *Hollywoodbets*, *Betway*, *Supabets*, *LottoStar*).
  * `ALCOHOL_TOBACCO`: Liquor stores, bottle stores, bars/taverns, vape shops (e.g., *Tops at SPAR*, *LiquorCity*, *Ultra Liquors*).
  * `LUXURY_NON_ESSENTIAL`: High-end fashion/cosmetics, gaming microtransactions, entertainment streaming subscriptions.
  * `UNAUTHORIZED_CASH_OUT_OR_P2P`: Unexplained peer-to-peer transfers, cash-send vouchers, or ATM cash withdrawals exceeding configurable thresholds (e.g., $>20\%$ of monthly allowance) where end-use cannot be verified.

#### FR-4: Mathematical Reconciliation & Compliance Scoring
* **FR-4.1:** The backend shall verify that extracted debits and credits reconcile with the statement's stated opening and closing balances within a tolerance of $\pm R0.05$. If a mismatch occurs, the audit is marked `RECONCILIATION_WARNING`.
* **FR-4.2:** The system shall compute an overall **Compliance Verdict**:
  * `COMPLIANT`: $0$ prohibited transactions AND unverified cash/P2P transfers $\le 15\%$ of total allowance.
  * `FLAGGED_REVIEW`: $0$ confirmed prohibited merchants, but high cash withdrawals/P2P transfers or ambiguous merchants with confidence $< 0.80$.
  * `NON_COMPLIANT`: $\ge 1$ confirmed transaction in `GAMBLING_BETTING` or `ALCOHOL_TOBACCO`, or cumulative non-permissible spend exceeding $5\%$ of total disbursements.

#### FR-5: Dashboard & Audit Reporting
* **FR-5.1:** The UI shall render a visual breakdown (donut/bar chart) of spending by category in ZAR and percentage of total allowance.
* **FR-5.2:** All `PROHIBITED` and `WARNING_REVIEW` rows shall be pinned to a **"Flagged Transactions"** alert panel with date, merchant, amount, and Gemini's policy rationale.
* **FR-5.3:** Compliance officers shall be able to export a signed PDF Audit Summary Report.

---

## 4. Gemini API Integration Specification

### 4.1 Model & Configuration
* **Primary Model:** `gemini-2.5-flash` (optimal latency/cost for structured tabular PDF extraction) with fallback to `gemini-2.5-pro` for low-DPI scanned documents.
* **Temperature:** `0.0` (deterministic classification).
* **Response MIME Type:** `application/json` with enforced `response_schema`.

### 4.2 System Instruction Prompt (Template)
```text
You are an expert South African NSFAS Bursary Compliance Auditor. Analyze the attached student bank statement.
Extract the statement metadata, summary totals, and every single transaction line item in chronological order.
Classify each transaction strictly according to DHET/NSFAS Living Allowance Guidelines:
- Permissible: staple food/groceries, essential toiletries/pharmacy items, mobile data, academic stationery/printing, local public commuting, and standard bank fees.
- Prohibited: gambling/sports betting (e.g., Betway, Hollywoodbets, Supabets), liquor/alcohol stores (e.g., Tops, LiquorCity, Ultra Liquors), tobacco/vaping, luxury goods, and entertainment/gaming.
- Flag high-value unverified P2P transfers or ATM cash withdrawals as WARNING_REVIEW.
Output strictly valid JSON conforming to the provided schema. Do not omit any rows.
```

### 4.3 JSON Output Schema (`response_schema`)
```json
{
  "type": "OBJECT",
  "properties": {
    "account_metadata": {
      "type": "OBJECT",
      "properties": {
        "bank_name": { "type": "STRING" },
        "account_holder": { "type": "STRING" },
        "statement_period": { "type": "STRING" },
        "opening_balance": { "type": "NUMBER" },
        "closing_balance": { "type": "NUMBER" }
      },
      "required": ["bank_name", "statement_period", "opening_balance", "closing_balance"]
    },
    "transactions": {
      "type": "ARRAY",
      "items": {
        "type": "OBJECT",
        "properties": {
          "date": { "type": "STRING" },
          "raw_description": { "type": "STRING" },
          "normalized_merchant": { "type": "STRING" },
          "type": { "type": "STRING", "enum": ["CREDIT", "DEBIT", "FEE"] },
          "amount": { "type": "NUMBER" },
          "balance": { "type": "NUMBER" },
          "category": {
            "type": "STRING",
            "enum": [
              "NSFAS_DISBURSEMENT",
              "FOOD_GROCERIES",
              "PERSONAL_CARE_HYGIENE",
              "ACADEMIC_DATA_PRINTING",
              "LOCAL_COMMUTE",
              "BANK_FEES",
              "GAMBLING_BETTING",
              "ALCOHOL_TOBACCO",
              "LUXURY_NON_ESSENTIAL",
              "UNVERIFIED_CASH_P2P"
            ]
          },
          "compliance_status": {
            "type": "STRING",
            "enum": ["PERMISSIBLE", "PROHIBITED", "WARNING_REVIEW"]
          },
          "flag_reason": { "type": "STRING" },
          "confidence_score": { "type": "NUMBER" }
        },
        "required": ["date", "raw_description", "type", "amount", "category", "compliance_status"]
      }
    }
  },
  "required": ["account_metadata", "transactions"]
}
```

---

## 5. Non-Functional Requirements

### 5.1 Security & POPIA Compliance
* **NFR-1:** All uploaded statements shall be encrypted in transit (TLS 1.3) and at rest (AES-256).
* **NFR-2:** Uploaded files sent to the Gemini API via the File API shall be programmatically deleted immediately after JSON extraction completes, and zero-data-retention enterprise API endpoints shall be used so student financial records are never used for model training.
* **NFR-3:** Role-Based Access Control (RBAC) shall restrict raw statement viewing to authorized bursary administrators.

### 5.2 Performance & Reliability
* **NFR-4:** End-to-end ingestion, Gemini extraction, and rule evaluation for a standard 12-month statement ($\approx 75$ transactions) shall complete in under **12 seconds** at the 95th percentile.
* **NFR-5:** If the Gemini API returns HTTP `429` or `503`, the ingestion worker shall execute exponential backoff retries (up to 3 attempts) before queueing for manual review.

---

## 6. Test Scenarios & Acceptance Criteria
1. **Baseline Compliant Test (`nsfas_student_statement_12_months.pdf`):** Must return `COMPLIANT`, extract all 72 transactions with $100\%$ balance reconciliation, and show $R0.00$ in prohibited categories.
2. **Non-Compliant Red-Flag Test (`nsfas_flagged_statement_12_months.pdf`):** Must return `NON_COMPLIANT`, flag every occurrence of online sports betting, bottle store purchases, and unverified cash-outs, and calculate the exact non-permissible ZAR total.