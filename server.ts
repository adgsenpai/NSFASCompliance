import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { DEFAULT_POLICY_CONFIG, evaluateAudit } from './src/shared/auditEngine.ts';
import type { PolicyConfig, RawExtractionPayload, SampleStatementInfo } from './src/shared/types.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB per FR-1.1
const INLINE_THRESHOLD_BYTES = 10 * 1024 * 1024; // 10 MB inline vs File API
const GEMINI_MODEL = 'gemini-4-hydrogen';

const SAMPLE_STATEMENTS: Record<'compliant' | 'flagged', SampleStatementInfo & { diskPath: string }> = {
  compliant: {
    id: 'compliant',
    title: '12-Month Compliant Student Statement',
    subtitle: '72 transactions · R 21,120.00 disbursed · Staple groceries, pharmacy, data & commuting',
    expectedOutcome: 'COMPLIANT',
    fileName: '12-Month_NSFAS_Student_Allowance_Statement.pdf',
    diskPath: path.resolve(
      process.cwd(),
      'public/assets/aistudio/12-Month_NSFAS_Student_Allowance_Statement_c31c9862.pdf'
    ),
  },
  flagged: {
    id: 'flagged',
    title: '12-Month Flagged / Non-Compliant Case',
    subtitle: '72 transactions · R 21,120.00 disbursed · Sports betting, liquor stores, gaming & P2P cash-outs',
    expectedOutcome: 'NON_COMPLIANT',
    fileName: '12-Month_NSFAS_Statement_Non-Compliant_Test_Case.pdf',
    diskPath: path.resolve(
      process.cwd(),
      'public/assets/aistudio/12-Month_NSFAS_Statement__Non-Compliant___Flagged_Test_Case__0f5a98ef.pdf'
    ),
  },
};

const SYSTEM_INSTRUCTION = `You are an expert South African NSFAS (National Student Financial Aid Scheme) Bursary Compliance Auditor.
Analyze the attached student bank or digital wallet statement across ALL pages.
Extract the statement account metadata and EVERY SINGLE transaction line item in exact chronological order. Do not omit, truncate, or summarize any rows.

Classification rules under DHET / NSFAS Living Allowance Guidelines:
1. type classification:
   - CREDIT: Incoming NSFAS / bursary allowance disbursements or deposits.
   - FEE: Monthly account maintenance, card service fees, or standard bank charges.
   - DEBIT: All purchases, POS swipes, EFT debits, online card payments, ATM withdrawals, and P2P transfers.
2. category & compliance_status classification:
   - NSFAS_DISBURSEMENT (PERMISSIBLE): Incoming NSFAS living allowance credits.
   - FOOD_GROCERIES (PERMISSIBLE): Supermarkets, fresh produce, pantry staples, meat/dairy, basic campus meals (e.g., Shoprite, Checkers, Pick n Pay, Boxer, Spar Food).
   - PERSONAL_CARE_HYGIENE (PERMISSIBLE): Pharmacies, toiletries, sanitary supplies, OTC meds, basic household cleaning (e.g., Clicks, Dis-Chem).
   - ACADEMIC_DATA_PRINTING (PERMISSIBLE): Prepaid mobile data bundles, stationery, campus printing and binding services.
   - LOCAL_COMMUTE (PERMISSIBLE): Municipal bus, commuter smartcard top-up, Metrorail, local public transit.
   - BANK_FEES (PERMISSIBLE): Standard monthly account & card service fees.
   - GAMBLING_BETTING (PROHIBITED): Online sportsbooks, betting sites, casinos, lottery operators (e.g., Hollywoodbets, Betway, Supabets, LottoStar).
   - ALCOHOL_TOBACCO (PROHIBITED): Liquor stores, bottle stores, bars/taverns, vape & tobacco shops (e.g., Tops at SPAR Liquor, LiquorCity, Ultra Liquors, Vape & Tobacco Lounge).
   - LUXURY_NON_ESSENTIAL (PROHIBITED): Gaming credits/platforms (e.g., PlayStation Network, Steam Games), entertainment streaming subscriptions, luxury fashion/cosmetics.
   - UNVERIFIED_CASH_P2P (WARNING_REVIEW): Unverified ATM cash withdrawals (especially in nightlife districts), immediate P2P cash sends, or e-wallet cash-outs without merchant verification.
3. For every PROHIBITED or WARNING_REVIEW transaction, provide a concise, specific flag_reason referencing the DHET/NSFAS guideline.
4. For numeric fields (opening_balance, closing_balance, amount, balance), output clean numbers without currency symbols or commas. Omit or null balance only if no running balance column exists on that row.
Output strictly valid JSON conforming to the provided schema.`;

const EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    account_metadata: {
      type: Type.OBJECT,
      properties: {
        bank_name: { type: Type.STRING, description: 'Name of the bank or wallet provider.' },
        account_holder: { type: Type.STRING, description: 'Full name or placeholder label of the account holder.' },
        account_number_masked: { type: Type.STRING, description: 'Account number, masked if numeric (e.g., ****4321).' },
        student_id: { type: Type.STRING, description: 'Student number or ID number if stated.' },
        institution: { type: Type.STRING, description: 'University or TVET college name if stated.' },
        statement_period: { type: Type.STRING, description: 'Statement start and end period.' },
        monthly_allowance_stated: { type: Type.NUMBER, description: 'Monthly allowance baseline in ZAR if stated.' },
        opening_balance: { type: Type.NUMBER, description: 'Statement opening balance in ZAR.' },
        closing_balance: { type: Type.NUMBER, description: 'Statement closing balance in ZAR.' },
      },
      required: ['bank_name', 'account_holder', 'statement_period', 'opening_balance', 'closing_balance'],
    },
    transactions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          date: { type: Type.STRING, description: 'Transaction date exactly as shown or ISO YYYY-MM-DD.' },
          raw_description: { type: Type.STRING, description: 'Exact transaction description from the ledger.' },
          normalized_merchant: { type: Type.STRING, description: 'Cleaned merchant or entity name.' },
          type: { type: Type.STRING, enum: ['CREDIT', 'DEBIT', 'FEE'] },
          amount: { type: Type.NUMBER, description: 'Positive numeric transaction amount in ZAR.' },
          balance: { type: Type.NUMBER, description: 'Running balance in ZAR after this transaction, if shown.' },
          category: {
            type: Type.STRING,
            enum: [
              'NSFAS_DISBURSEMENT',
              'FOOD_GROCERIES',
              'PERSONAL_CARE_HYGIENE',
              'ACADEMIC_DATA_PRINTING',
              'LOCAL_COMMUTE',
              'BANK_FEES',
              'GAMBLING_BETTING',
              'ALCOHOL_TOBACCO',
              'LUXURY_NON_ESSENTIAL',
              'UNVERIFIED_CASH_P2P',
            ],
          },
          compliance_status: {
            type: Type.STRING,
            enum: ['PERMISSIBLE', 'PROHIBITED', 'WARNING_REVIEW'],
          },
          flag_reason: { type: Type.STRING, description: 'Concise policy explanation if flagged or prohibited.' },
          confidence_score: { type: Type.NUMBER, description: 'Classification confidence from 0.0 to 1.0.' },
        },
        required: ['date', 'raw_description', 'type', 'amount', 'category', 'compliance_status'],
      },
    },
  },
  required: ['account_metadata', 'transactions'],
};

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const validExt = ['.pdf', '.png', '.jpg', '.jpeg'].includes(ext);
    if (ALLOWED_MIME_TYPES.has(file.mimetype) || validExt) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file format. Please upload a .pdf, .png, or .jpg bank statement.'));
    }
  },
});

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function maskAccountNumber(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('[')) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length >= 6) {
    return `•••• •••• ${digits.slice(-4)}`;
  }
  return trimmed;
}

function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number; code?: number })?.status ?? (err as { code?: number })?.code;
  return (
    status === 429 ||
    status === 503 ||
    msg.includes('429') ||
    msg.includes('503') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('UNAVAILABLE')
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function extractStatementWithGemini(params: {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}): Promise<{ payload: RawExtractionPayload; modelUsed: string }> {
  const ai = getGeminiClient();
  const normalizedMime = params.mimeType === 'image/jpg' ? 'image/jpeg' : params.mimeType;

  if (normalizedMime === 'application/pdf') {
    const header = params.buffer.subarray(0, 5).toString('ascii');
    if (header !== '%PDF-') {
      throw new Error('The uploaded PDF appears corrupted or invalid.');
    }
    const pdfTextProbe = params.buffer.toString('latin1', 0, Math.min(params.buffer.length, 65536));
    if (pdfTextProbe.includes('/Encrypt')) {
      throw new Error('Password-protected or encrypted PDFs are not supported. Please upload an unlocked statement.');
    }
  }

  let uploadedFileName: string | undefined;
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      let documentPart: Record<string, unknown>;

      if (params.buffer.byteLength > INLINE_THRESHOLD_BYTES) {
        const blob = new Blob([new Uint8Array(params.buffer)], { type: normalizedMime });
        const uploaded = await ai.files.upload({
          file: blob,
          config: { mimeType: normalizedMime, displayName: params.fileName },
        });
        uploadedFileName = uploaded.name;
        documentPart = {
          fileData: {
            fileUri: uploaded.uri,
            mimeType: uploaded.mimeType ?? normalizedMime,
          },
        };
      } else {
        documentPart = {
          inlineData: {
            mimeType: normalizedMime,
            data: params.buffer.toString('base64'),
          },
        };
      }

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: {
          parts: [
            documentPart as { inlineData: { mimeType: string; data: string } },
            {
              text: 'Extract the account metadata and EVERY SINGLE transaction row from this student bank statement in chronological order. Verify all debit, credit, and balance figures carefully.',
            },
          ],
        },
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: EXTRACTION_SCHEMA,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        throw new Error('Gemini returned an empty response for this document.');
      }

      const parsed = JSON.parse(rawText) as RawExtractionPayload;
      if (!parsed.account_metadata || !Array.isArray(parsed.transactions) || parsed.transactions.length === 0) {
        throw new Error('No readable transaction ledger rows were detected in the uploaded document.');
      }

      parsed.account_metadata.account_number_masked = maskAccountNumber(
        parsed.account_metadata.account_number_masked
      );

      return { payload: parsed, modelUsed: GEMINI_MODEL };
    } catch (err) {
      lastError = err;
      if (attempt < 3 && isRetryableError(err)) {
        await sleep(800 * Math.pow(2, attempt - 1));
        continue;
      }
      break;
    } finally {
      if (uploadedFileName) {
        const nameToDelete = uploadedFileName;
        uploadedFileName = undefined;
        await ai.files.delete({ name: nameToDelete }).catch(() => {
          // Best-effort cleanup per NFR-2
        });
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to analyze statement via Gemini API.');
}

function parsePolicyConfig(raw: unknown): PolicyConfig {
  if (!raw) return DEFAULT_POLICY_CONFIG;
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      monthlyBaselineZar: Number(obj.monthlyBaselineZar) || DEFAULT_POLICY_CONFIG.monthlyBaselineZar,
      cashP2pWarningPct:
        typeof obj.cashP2pWarningPct === 'number'
          ? obj.cashP2pWarningPct
          : DEFAULT_POLICY_CONFIG.cashP2pWarningPct,
      nonPermissibleFailPct:
        typeof obj.nonPermissibleFailPct === 'number'
          ? obj.nonPermissibleFailPct
          : DEFAULT_POLICY_CONFIG.nonPermissibleFailPct,
      confidenceThreshold:
        typeof obj.confidenceThreshold === 'number'
          ? obj.confidenceThreshold
          : DEFAULT_POLICY_CONFIG.confidenceThreshold,
      customProhibitedKeywords: Array.isArray(obj.customProhibitedKeywords)
        ? obj.customProhibitedKeywords.map(String)
        : [],
      customPermissibleKeywords: Array.isArray(obj.customPermissibleKeywords)
        ? obj.customPermissibleKeywords.map(String)
        : [],
    };
  } catch {
    return DEFAULT_POLICY_CONFIG;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, model: GEMINI_MODEL });
  });

  app.get('/api/samples', (_req, res) => {
    const samples: SampleStatementInfo[] = [
      {
        id: SAMPLE_STATEMENTS.compliant.id,
        title: SAMPLE_STATEMENTS.compliant.title,
        subtitle: SAMPLE_STATEMENTS.compliant.subtitle,
        expectedOutcome: SAMPLE_STATEMENTS.compliant.expectedOutcome,
        fileName: SAMPLE_STATEMENTS.compliant.fileName,
      },
      {
        id: SAMPLE_STATEMENTS.flagged.id,
        title: SAMPLE_STATEMENTS.flagged.title,
        subtitle: SAMPLE_STATEMENTS.flagged.subtitle,
        expectedOutcome: SAMPLE_STATEMENTS.flagged.expectedOutcome,
        fileName: SAMPLE_STATEMENTS.flagged.fileName,
      },
    ];
    res.json({ samples });
  });

  app.get('/api/samples/:id/download', async (req, res, next) => {
    try {
      const id = req.params.id as 'compliant' | 'flagged';
      const sample = SAMPLE_STATEMENTS[id];
      if (!sample) {
        res.status(404).json({ error: 'Sample statement not found.' });
        return;
      }
      const buffer = await fs.readFile(sample.diskPath);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${sample.fileName}"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/audit/sample', async (req, res) => {
    const startedAt = Date.now();
    try {
      const sampleId = req.body?.sampleId as 'compliant' | 'flagged';
      const sample = SAMPLE_STATEMENTS[sampleId];
      if (!sample) {
        res.status(400).json({ error: 'Invalid sampleId. Expected "compliant" or "flagged".' });
        return;
      }

      const policyConfig = parsePolicyConfig(req.body?.policyConfig);
      const buffer = await fs.readFile(sample.diskPath);

      const { payload, modelUsed } = await extractStatementWithGemini({
        buffer,
        mimeType: 'application/pdf',
        fileName: sample.fileName,
      });

      const result = evaluateAudit({
        auditId: `AUD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        fileName: sample.fileName,
        analyzedAt: new Date().toISOString(),
        processingTimeMs: Date.now() - startedAt,
        modelUsed,
        payload,
        policyConfig,
      });

      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to audit sample statement.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/audit/analyze', upload.single('statement'), async (req, res) => {
    const startedAt = Date.now();
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'No statement file uploaded.' });
        return;
      }

      const ext = path.extname(file.originalname).toLowerCase();
      let mimeType = file.mimetype;
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        if (ext === '.pdf') mimeType = 'application/pdf';
        else if (ext === '.png') mimeType = 'image/png';
        else mimeType = 'image/jpeg';
      }

      const policyConfig = parsePolicyConfig(req.body?.policyConfig);

      const { payload, modelUsed } = await extractStatementWithGemini({
        buffer: file.buffer,
        mimeType,
        fileName: file.originalname,
      });

      const result = evaluateAudit({
        auditId: `AUD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        fileName: file.originalname,
        analyzedAt: new Date().toISOString(),
        processingTimeMs: Date.now() - startedAt,
        modelUsed,
        payload,
        policyConfig,
      });

      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze statement.';
      res.status(500).json({ error: message });
    }
  });

  // Multer & Express error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'File exceeds the 25 MB maximum upload limit.' });
      return;
    }
    const message = err instanceof Error ? err.message : 'Internal server error.';
    res.status(400).json({ error: message });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NSFAS Compliance & Audit Engine listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
