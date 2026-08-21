// Behavior-equivalence safety net for generatePermitPdf's refactor: pdf-lib's
// output isn't byte-stable run-to-run (e.g. setCreationDate(new Date())), so
// this snapshots the exact ordered sequence of drawing/document-metadata
// calls instead of the raw PDF bytes. As long as this suite is green, the
// function draws the same things, in the same order, with the same
// arguments — which is the invariant a pure decomposition refactor must
// preserve. Written and captured against the pre-refactor implementation.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PDFDocument, PDFPage, type PDFFont } from 'pdf-lib';
import { generatePermitPdf, type PermitPdfData } from './generate-permit-pdf';

type CallRecord = { op: string; args: unknown[] };

function normalizeArg(arg: unknown): unknown {
  if (arg && typeof arg === 'object' && 'name' in arg && 'widthOfTextAtSize' in arg) {
    return `<font:${(arg as PDFFont).name}>`;
  }
  if (arg instanceof Uint8Array) {
    // The only Uint8Array payload passed to a spied method is the attached
    // digital-permit JSON — decode it so the snapshot is readable and its
    // diff (if any) is meaningful, not a wall of byte numbers.
    try {
      return { __decodedJson: JSON.parse(new TextDecoder().decode(arg)) };
    } catch {
      return `<bytes:${arg.length}>`;
    }
  }
  if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(arg)) out[k] = normalizeArg(v);
    return out;
  }
  return arg;
}

async function captureDrawCalls(permit: PermitPdfData): Promise<CallRecord[]> {
  const log: CallRecord[] = [];

  const originals = {
    drawText: PDFPage.prototype.drawText,
    drawRectangle: PDFPage.prototype.drawRectangle,
    drawLine: PDFPage.prototype.drawLine,
    attach: PDFDocument.prototype.attach,
    setTitle: PDFDocument.prototype.setTitle,
    setAuthor: PDFDocument.prototype.setAuthor,
    setSubject: PDFDocument.prototype.setSubject,
    setCreationDate: PDFDocument.prototype.setCreationDate,
  };

  function spy(target: object, key: string, original: (...args: unknown[]) => unknown) {
    const mock = vi.fn(function (this: unknown, ...args: unknown[]) {
      log.push({ op: key, args: args.map(normalizeArg) });
      return original.apply(this, args);
    });
    Object.defineProperty(target, key, { value: mock, configurable: true });
  }

  const asGeneric = (fn: unknown) => fn as (...args: unknown[]) => unknown;
  spy(PDFPage.prototype, 'drawText', asGeneric(originals.drawText));
  spy(PDFPage.prototype, 'drawRectangle', asGeneric(originals.drawRectangle));
  spy(PDFPage.prototype, 'drawLine', asGeneric(originals.drawLine));
  spy(PDFDocument.prototype, 'attach', asGeneric(originals.attach));
  spy(PDFDocument.prototype, 'setTitle', asGeneric(originals.setTitle));
  spy(PDFDocument.prototype, 'setAuthor', asGeneric(originals.setAuthor));
  spy(PDFDocument.prototype, 'setSubject', asGeneric(originals.setSubject));
  spy(PDFDocument.prototype, 'setCreationDate', asGeneric(originals.setCreationDate));

  try {
    await generatePermitPdf(permit);
  } finally {
    for (const [key, original] of Object.entries(originals)) {
      const target = key === 'drawText' || key === 'drawRectangle' || key === 'drawLine' ? PDFPage.prototype : PDFDocument.prototype;
      Object.defineProperty(target, key, { value: original, configurable: true });
    }
  }

  return log;
}

const AUTHORIZED_PERSONS = [
  { name: '', affiliation: 'UMC Utrecht', role: 'RESEARCHER', did: 'did:key:zResearcher' },
  { name: '', affiliation: 'UMC Utrecht', role: 'OUTPUT_CONTROLLER', did: 'did:key:zOutputController' },
];

const GRANTED_DATASETS = [
  {
    dataHolderName: 'GP Information Network (LINH)',
    name: 'Huisartsenregistratie cardiovasculair risicomanagement',
    url: 'https://example.org/dataset/1',
    datasetId: 'ds-1',
    catalogId: 'cat-1',
    distributions: [],
    storageLocation: { reference: 'spe://bucket/ds-1', writerDid: 'did:key:zWriter' },
  },
];

const LINE_ITEMS = [
  { category: 'ADMINISTRATIVE' as const, description: null, amount: 250 },
  { category: 'SPE_SETUP' as const, description: null, amount: 500 },
  { category: 'SPE_USAGE' as const, description: 'Eerste 3 maanden', amount: 150 },
];

function baseFixture(): PermitPdfData {
  return {
    permitNumber: 'DP-NL-2025-0001',
    version: 1,
    status: 'GRANTED',
    applicationId: 'app-1',
    issuedAt: new Date('2026-01-15T10:00:00Z'),
    validFrom: new Date('2026-01-15T00:00:00Z'),
    validUntil: new Date('2027-01-15T00:00:00Z'),
    previousPermitId: null,
    previousPermit: null,
    revocationReason: null,
    revocationAt: null,
    signature: 'a'.repeat(88),
    signedAt: new Date('2026-01-15T10:05:00Z'),
    signingKeyId: 'key-1',
    currency: 'EUR',
    lineItems: LINE_ITEMS,
    authorizedPersons: AUTHORIZED_PERSONS,
    grantedDatasets: GRANTED_DATASETS,
    speOperatorId: 'spe-op-1',
    speOperatorName: 'SURF Research Cloud',
    speOperatorProviderName: 'SURF',
    speTypeId: 'spe-type-1',
    speTypeName: 'Standard SPE',
    purposeCategory: 'SCIENTIFIC_RESEARCH',
    purposeCategories: ['SCIENTIFIC_RESEARCH'],
    electronicHealthDataFormat: null,
    application: {
      referenceNumber: 'HDAB-2025-0001',
      title: 'Cardiovascular risk factors in Dutch primary care',
      type: 'DATA_ACCESS_APPLICATION',
      submittedAt: new Date('2025-11-01T00:00:00Z'),
      decisionSummary: 'Approved without conditions.',
      projectDescription: 'Retrospective cohort study.',
      purposeCategory: 'SCIENTIFIC_RESEARCH',
      requestedVariables: 'Age, sex, BMI, blood pressure',
      studyPopulation: 'Adults aged 18-80',
      inclusionCriteria: 'Age 18-80, registered >=1 year',
      exclusionCriteria: 'Incomplete registration',
      ethicalReviewRequired: true,
      ethicalReviewStatus: 'APPROVED',
      ethicalReviewBody: 'METC Utrecht',
      ethicalReviewReference: 'METC-2025-042',
      ethicalReviewDate: new Date('2025-10-15T00:00:00Z'),
      dataStartDate: new Date('2015-01-01T00:00:00Z'),
      dataEndDate: new Date('2024-12-31T00:00:00Z'),
      legalBasis: 'EHDS Art. 53(1) - scientific research',
      dataProcessingCountry: 'NL',
      isCrossBorder: false,
      applicant: { name: 'Dr. A. de Vries', organisation: 'UMC Utrecht', email: 'researcher@umcu.nl' },
    },
  };
}

describe('generatePermitPdf — draw-call sequence (behavior-equivalence snapshot)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('a granted DATA_ACCESS_APPLICATION permit with fees, SPE, authorized persons and a signature', async () => {
    const log = await captureDrawCalls(baseFixture());
    expect(log).toMatchSnapshot();
  });

  it('a revoked permit', async () => {
    const permit = baseFixture();
    permit.status = 'REVOKED';
    permit.revocationReason = 'Data holder withdrew consent to the underlying dataset.';
    permit.revocationAt = new Date('2026-06-01T00:00:00Z');
    const log = await captureDrawCalls(permit);
    expect(log).toMatchSnapshot();
  });

  it('a DATA_REQUEST permit (skips the SPE subsection, no line items, no signature block)', async () => {
    const permit = baseFixture();
    permit.application = { ...permit.application!, type: 'DATA_REQUEST' };
    permit.lineItems = null;
    permit.signature = null;
    permit.signedAt = null;
    permit.signingKeyId = null;
    const log = await captureDrawCalls(permit);
    expect(log).toMatchSnapshot();
  });

  it('an amendment (previousPermit set, cross-border, no signature block yet)', async () => {
    const permit = baseFixture();
    permit.status = 'AMENDED';
    permit.previousPermitId = 'prev-permit-1';
    permit.previousPermit = { permitNumber: 'DP-NL-2025-0001', version: 1 };
    permit.application = { ...permit.application!, isCrossBorder: true, dataProcessingCountry: 'BE' };
    permit.signature = null;
    permit.signedAt = null;
    permit.signingKeyId = null;
    const log = await captureDrawCalls(permit);
    expect(log).toMatchSnapshot();
  });
});
