# NSFAS Compliance & Audit Engine

Automated extraction, reconciliation and compliance auditing of NSFAS student living-allowance statements.

Upload a student bank or digital-wallet statement (PDF / PNG / JPG) and the engine will:

1. **Extract** every transaction using Gemini's multimodal document understanding with a strict JSON schema.
2. **Classify** each line item (groceries, transport, data, gambling, alcohol, cash/P2P transfers, …) against DHET/NSFAS bursary guidelines.
3. **Reconcile** the maths — `Opening Balance + Σ Credits − Σ Debits = Closing Balance`.
4. **Decide** a verdict — `COMPLIANT`, `FLAGGED_REVIEW` or `NON_COMPLIANT` — using deterministic, configurable business rules layered on top of the AI classification.
5. **Report** through an interactive dashboard with spending charts, flagged-transaction evidence, officer overrides, and CSV / signed PDF exports.

## Features

- Multimodal statement ingestion (multi-page PDFs and scanned images, 12+ months of history)
- Deterministic rule engine (`src/shared/auditEngine.ts`) with configurable policy:
  - Monthly allowance baseline (default **R1,760**)
  - Cash / P2P transfer warning threshold (default **15%**)
  - Non-permissible spend fail threshold (default **5%**)
  - AI confidence threshold for manual review (default **0.8**)
  - Custom prohibited / permissible merchant keywords
- Officer overrides with audit notes, re-evaluated live
- Monthly allowance utilisation and category breakdown charts
- Export the ledger to CSV or a signed audit report to PDF
- Built-in sample statements (compliant and non-compliant test cases) for demos

## Tech stack

- **Frontend:** React 19, Vite, Tailwind CSS 4, Motion, Lucide icons
- **Backend:** Express (TypeScript via `tsx`), Multer for uploads
- **AI:** Google Gemini via `@google/genai`
- **Reports:** jsPDF + jspdf-autotable

## Getting started

**Prerequisites:** Node.js 20+ (or Bun) and a [Gemini API key](https://aistudio.google.com/apikey).

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
#    then set GEMINI_API_KEY in .env.local

# 3. Run the dev server (Express + Vite middleware)
npm run dev
```

Open http://localhost:3000 (override with the `PORT` env var).

### Production

```bash
npm run build
NODE_ENV=production npm start
```

## API

| Method | Endpoint                        | Description                                         |
| ------ | ------------------------------- | --------------------------------------------------- |
| GET    | `/api/health`                   | Health check and active Gemini model                |
| GET    | `/api/samples`                  | List bundled sample statements                      |
| GET    | `/api/samples/:id/download`     | Download a sample statement                         |
| POST   | `/api/audit/sample`             | Run an audit on a bundled sample                    |
| POST   | `/api/audit/analyze`            | Audit an uploaded statement (`multipart`, field `statement`) |

## Project structure

```
server.ts                  Express server, Gemini extraction, API routes
src/
  App.tsx                  Dashboard shell
  components/              Ingestion, ledger, flagged items, charts, policy rules
  shared/auditEngine.ts    Deterministic compliance + reconciliation engine
  shared/types.ts          Shared types
  utils/                   CSV and PDF report exporters
public/assets/aistudio/    Sample statements and the SRS document
```

## Privacy

Statements contain personal financial information. Handle uploads in line with **POPIA**. Never commit real student statements or your `.env.local`. The bundled samples are synthetic, placeholder-only test documents.

## License

No license has been specified yet. All rights reserved by the author unless a license is added.
