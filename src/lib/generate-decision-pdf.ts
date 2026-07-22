import { DecisionOutcome } from '@prisma/client';
import { Doc, C, fmt } from './generate-permit-pdf';
import { APP_NAME } from './branding';

// The decision card (D6.4 §9.2): a positive decision gets an unsigned
// notice — the real permit, with its validity period and fees, is decided
// separately at issuance time (PermitPanel), so this is a summary notice
// rather than a pre-rendering of the permit itself. A negative decision
// gets the final, signed decision document (R9.2.3). Much shorter than the
// permit template — a decision letter, not a 10-section permit — but reuses
// the same Doc layout primitives.

export type DecisionPdfData = {
  decisionId: string;
  decisionOutcome: DecisionOutcome;
  decisionAt: Date;
  decisionSummary: string | null;
  legalBasis: string;
  application: {
    referenceNumber: string;
    title: string;
    type: string;
    applicant: { name: string; organisation: string; email: string };
  };
  decisionCardSignature: string | null;
  decisionCardSignedAt: Date | null;
  decisionCardSigningKeyId: string | null;
};

export async function generateDecisionPdf(decision: DecisionPdfData): Promise<Uint8Array> {
  const positive = decision.decisionOutcome === 'POSITIVE';

  const doc = new Doc();
  await doc.init();
  doc.pdfDoc.setTitle(`Besluit ${decision.decisionId}`);
  doc.pdfDoc.setAuthor(APP_NAME);
  doc.newPage();

  doc.rect(0, 0, 595, 90, C.darkBlue);
  doc.text(APP_NAME, 40, 24, doc.bold, 14, C.white);
  doc.text('Health Data Access Body Nederland (HDAB-NL)', 40, 44, doc.regular, 9, C.white);
  doc.text(
    positive ? 'BESLUIT TOEKENNING GEGEVENSTOEGANG' : 'AFWIJZING GEGEVENSTOEGANG',
    40, 62, doc.bold, 12, C.white,
  );
  doc.y = 110;

  doc.rect(40, doc.y, 515, 56, positive ? C.greenBg : C.redBg);
  doc.text('Besluit-ID', 48, doc.y + 8, doc.regular, 7.5, C.gray);
  doc.text(decision.decisionId, 48, doc.y + 20, doc.bold, 11, positive ? C.green : C.redText);
  doc.text('Datum besluit', 300, doc.y + 8, doc.regular, 7.5, C.gray);
  doc.text(fmt(decision.decisionAt), 300, doc.y + 20, doc.bold, 10, C.black);
  doc.y += 70;

  doc.heading('1', 'AANVRAAG');
  doc.field('Referentienummer', decision.application.referenceNumber);
  doc.field('Titel', decision.application.title);
  doc.field(
    'Type aanvraag',
    decision.application.type === 'DATA_ACCESS_APPLICATION'
      ? 'Data-toegangsaanvraag (Art. 67)'
      : 'Dataverzoek (Art. 69)',
  );
  doc.field('Aanvrager', decision.application.applicant.name);
  doc.field('Organisatie', decision.application.applicant.organisation);
  doc.field('Rechtsgrondslag', decision.legalBasis);
  doc.spacer(4);

  doc.heading('2', 'BESLISSING EN MOTIVERING');
  doc.paragraph(
    positive
      ? 'De Health Data Access Body Nederland (HDAB-NL) heeft besloten deze aanvraag TOE TE KENNEN, ' +
        'op grond van artikel 68 van Verordening (EU) 2025/327 (EHDS-verordening). De formele ' +
        'vergunning, met geldigheidsperiode en kosten, volgt na uw bevestiging van dit besluit.'
      : 'De Health Data Access Body Nederland (HDAB-NL) heeft besloten deze aanvraag AF TE WIJZEN, ' +
        'op grond van artikel 68 van Verordening (EU) 2025/327 (EHDS-verordening).',
    { font: doc.bold },
  );
  doc.spacer(4);
  if (decision.decisionSummary) {
    doc.paragraph(decision.decisionSummary);
  } else {
    doc.placeholder('geen motivering geregistreerd');
  }
  doc.spacer(4);

  doc.heading('3', 'RECHTSMIDDELEN');
  doc.paragraph(
    'Tegen dit besluit kan bezwaar worden gemaakt en, aansluitend, beroep worden ingesteld bij de ' +
    'bevoegde Nederlandse bestuursrechter, overeenkomstig de Algemene wet bestuursrecht.',
  );
  doc.spacer(4);

  if (decision.decisionCardSignature && decision.decisionCardSigningKeyId && decision.decisionCardSignedAt) {
    doc.heading('4', 'DIGITALE ONDERTEKENING');
    doc.field('Algoritme', 'Ed25519');
    doc.field('Sleutel-ID', decision.decisionCardSigningKeyId);
    doc.field('Ondertekend op', fmt(decision.decisionCardSignedAt));
    doc.field('Handtekening', `${decision.decisionCardSignature.slice(0, 24)}...`);
    doc.paragraph(
      'Onafhankelijk te verifieren tegen de publieke sleutel op /.well-known/jwks.json.',
      { size: 8, color: C.gray },
    );
  } else if (positive) {
    doc.heading('4', 'STATUS');
    doc.paragraph(
      'Dit is een onbevestigd besluitbericht (pre-permit) ter beoordeling. Het document is niet ' +
      'digitaal ondertekend — de definitieve, ondertekende vergunning volgt na acceptatie.',
      { size: 8, color: C.gray, font: doc.italic },
    );
  }

  doc.footer();
  return doc.pdfDoc.save();
}
