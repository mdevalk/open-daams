import { AppealStatus } from '@prisma/client';
import { Doc, C, fmt } from './generate-permit-pdf';
import { APP_NAME } from './branding';

// The formal, signed decision on an appeal (D6.4 R10.0.6) — generated once,
// when the appeal reaches a terminal outcome (UPHELD/REJECTED; WITHDRAWN
// isn't a decision on the merits, so it never reaches here). Much shorter
// than the original decision document, but reuses the same Doc primitives.

const STATUS_LABEL: Record<AppealStatus, string> = {
  SUBMITTED: 'Ingediend',
  UNDER_REVIEW: 'In behandeling',
  UPHELD: 'Toegewezen',
  REJECTED: 'Afgewezen',
  WITHDRAWN: 'Ingetrokken',
};

export type AppealDecisionPdfData = {
  appealId: string;
  status: AppealStatus;
  submittedBy: string;
  grounds: string;
  authority: string | null;
  decisionAt: Date;
  decisionSummary: string | null;
  application: {
    referenceNumber: string;
    title: string;
  };
  signature: string;
  signedAt: Date;
  signingKeyId: string;
};

export async function generateAppealDecisionPdf(decision: AppealDecisionPdfData): Promise<Uint8Array> {
  const upheld = decision.status === 'UPHELD';

  const doc = new Doc();
  await doc.init();
  doc.pdfDoc.setTitle(`Bezwaarbeslissing ${decision.appealId}`);
  doc.pdfDoc.setAuthor(APP_NAME);
  doc.newPage();

  doc.rect(0, 0, 595, 90, C.darkBlue);
  doc.text(APP_NAME, 40, 24, doc.bold, 14, C.white);
  doc.text('Health Data Access Body Nederland (HDAB-NL)', 40, 44, doc.regular, 9, C.white);
  doc.text('BESLISSING OP BEZWAAR', 40, 62, doc.bold, 12, C.white);
  doc.y = 110;

  doc.rect(40, doc.y, 515, 56, upheld ? C.greenBg : C.redBg);
  doc.text('Uitkomst', 48, doc.y + 8, doc.regular, 7.5, C.gray);
  doc.text(STATUS_LABEL[decision.status], 48, doc.y + 20, doc.bold, 11, upheld ? C.green : C.redText);
  doc.text('Datum beslissing', 300, doc.y + 8, doc.regular, 7.5, C.gray);
  doc.text(fmt(decision.decisionAt), 300, doc.y + 20, doc.bold, 10, C.black);
  doc.y += 70;

  doc.heading('1', 'AANVRAAG');
  doc.field('Referentienummer', decision.application.referenceNumber);
  doc.field('Titel', decision.application.title);
  doc.spacer(4);

  doc.heading('2', 'BEZWAAR');
  doc.field('Indiener', decision.submittedBy);
  if (decision.authority) doc.field('Behandelende instantie', decision.authority);
  doc.paragraph(decision.grounds);
  doc.spacer(4);

  doc.heading('3', 'BESLISSING EN MOTIVERING');
  if (decision.decisionSummary) {
    doc.paragraph(decision.decisionSummary);
  } else {
    doc.placeholder('geen motivering geregistreerd');
  }
  doc.spacer(4);

  doc.heading('4', 'DIGITALE ONDERTEKENING');
  doc.field('Algoritme', 'Ed25519');
  doc.field('Sleutel-ID', decision.signingKeyId);
  doc.field('Ondertekend op', fmt(decision.signedAt));
  doc.field('Handtekening', `${decision.signature.slice(0, 24)}...`);
  doc.paragraph(
    'Onafhankelijk te verifieren tegen de publieke sleutel op /.well-known/jwks.json.',
    { size: 8, color: C.gray },
  );

  doc.footer();
  return doc.pdfDoc.save();
}
