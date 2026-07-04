import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';

const C = {
  darkBlue: rgb(0.082, 0.259, 0.451),
  lightBlue: rgb(0.004, 0.412, 0.608),
  white: rgb(1, 1, 1),
  black: rgb(0, 0, 0),
  gray: rgb(0.349, 0.349, 0.349),
  lightGray: rgb(0.941, 0.941, 0.941),
  green: rgb(0.102, 0.361, 0.180),
  greenBg: rgb(0.902, 0.961, 0.918),
  blueBg: rgb(0.91, 0.957, 0.984),
  divider: rgb(0.816, 0.816, 0.816),
  redText: rgb(0.478, 0.090, 0.067),
  redBg: rgb(0.988, 0.910, 0.902),
};

function fmt(d: Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const STATUS_NL: Record<string, string> = {
  GRANTED: 'Verleend',
  AMENDED: 'Gewijzigd',
  RENEWED: 'Verlengd',
  REVOKED: 'Ingetrokken',
  EXPIRED: 'Verlopen',
};

export type PermitPdfData = {
  permitNumber: string;
  status: string;
  issuedAt: Date | null;
  validFrom: Date | null;
  validUntil: Date | null;
  revocationReason?: string | null;
  application: {
    referenceNumber: string;
    title: string;
    type: string;
    legalBasis?: string | null;
    dataProcessingCountry?: string | null;
    applicant: { name: string; organisation: string; email: string };
  } | null;
};

const PW = 595; // A4 width in points
const PH = 842; // A4 height in points
const M = 40;   // margin
const CW = PW - M * 2;

function rect(
  page: PDFPage,
  x: number, y: number, w: number, h: number,
  color: ReturnType<typeof rgb>,
) {
  page.drawRectangle({ x, y: PH - y - h, width: w, height: h, color });
}

function text(
  page: PDFPage,
  str: string,
  x: number, y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
  maxWidth?: number,
): number {
  if (!maxWidth) {
    page.drawText(str, { x, y: PH - y - size, font, size, color });
    return y + size * 1.5;
  }
  const words = str.split(' ');
  let line = '';
  let curY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      page.drawText(line, { x, y: PH - curY - size, font, size, color });
      curY += size * 1.5;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) page.drawText(line, { x, y: PH - curY - size, font, size, color });
  return curY + size * 1.5;
}

export async function generatePermitPdf(permit: PermitPdfData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Vergunning ${permit.permitNumber}`);
  pdfDoc.setAuthor('HDAB-NL');
  pdfDoc.setSubject('EHDS Dataverwerkingsvergunning');
  pdfDoc.setCreationDate(new Date());

  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([PW, PH]);

  // Header
  rect(page, 0, 0, PW, 70, C.darkBlue);
  text(page, 'HDAB-NL | DAAMS', M, 18, bold, 16, C.white);
  text(page, 'Health Data Access Body Nederland - EHDS Dataverwerkingsvergunning', M, 40, regular, 8, rgb(0.8, 0.85, 0.9));

  let y = 88;

  // Permit number box
  rect(page, M, y, CW, 58, C.lightGray);
  rect(page, M, y, 4, 58, C.darkBlue);
  text(page, 'VERGUNNINGSNUMMER', M + 14, y + 10, regular, 7, C.gray);
  text(page, permit.permitNumber, M + 14, y + 24, bold, 15, C.darkBlue);

  const statusLabel = STATUS_NL[permit.status] ?? permit.status;
  const badgeW = bold.widthOfTextAtSize(statusLabel, 7.5) + 16;
  const isRevoked = permit.status === 'REVOKED';
  rect(page, M + 14, y + 42, badgeW, 13, isRevoked ? C.redBg : C.greenBg);
  text(page, statusLabel, M + 22, y + 44, bold, 7.5, isRevoked ? C.redText : C.green);

  y += 70;

  // Validity boxes
  const boxW = (CW - 16) / 3;
  [
    { label: 'GELDIG VANAF', value: fmt(permit.validFrom) },
    { label: 'GELDIG TOT EN MET', value: fmt(permit.validUntil) },
    { label: 'UITGEGEVEN OP', value: fmt(permit.issuedAt) },
  ].forEach((item, i) => {
    const bx = M + i * (boxW + 8);
    rect(page, bx, y, boxW, 46, C.lightGray);
    text(page, item.label, bx + 10, y + 9, regular, 7, C.gray);
    text(page, item.value, bx + 10, y + 22, bold, 11, C.darkBlue);
  });

  y += 58;

  const sectionTitle = (title: string) => {
    text(page, title, M, y, bold, 8, C.darkBlue);
    y += 13;
    page.drawLine({ start: { x: M, y: PH - y }, end: { x: M + CW, y: PH - y }, thickness: 0.5, color: C.divider });
    y += 8;
  };

  const field = (label: string, value: string) => {
    text(page, label, M, y, regular, 8.5, C.gray);
    const nextY = text(page, value, M + 155, y, bold, 8.5, C.black, CW - 155);
    y = nextY + 2;
  };

  const app = permit.application;
  if (app) {
    sectionTitle('AANVRAGER');
    field('Naam', app.applicant.name);
    field('Organisatie', app.applicant.organisation);
    field('E-mail', app.applicant.email);
    y += 6;

    sectionTitle('AANVRAAGGEGEVENS');
    field('Kenmerk', app.referenceNumber);
    field('Titel', app.title);
    field('Type', app.type === 'DATA_ACCESS_APPLICATION'
      ? 'Data-toegangsaanvraag (Art. 46 EHDS)'
      : 'Dataverzoek (Art. 69 EHDS)');
    if (app.legalBasis) field('Juridische grondslag', app.legalBasis);
    if (app.dataProcessingCountry) field('Verwerkingsland', app.dataProcessingCountry);
    y += 6;
  }

  if (permit.revocationReason) {
    sectionTitle('REDEN INTREKKING');
    text(page, permit.revocationReason, M, y, regular, 8.5, C.redText, CW);
    y += 20;
  }

  // Legal notice
  y += 4;
  rect(page, M, y, CW, 54, C.blueBg);
  rect(page, M, y, 4, 54, C.lightBlue);
  text(
    page,
    'Deze vergunning is afgegeven op grond van de EHDS Verordening (EU) 2025/327 en de nationale ' +
    'implementatie daarvan. De vergunning is persoonsgebonden en niet overdraagbaar. Gebruik van de ' +
    'verleende gegevens is uitsluitend toegestaan voor het omschreven doel. TEHDAS2 D6.4 par. 9.',
    M + 14, y + 10, regular, 7.5, C.darkBlue, CW - 24,
  );

  // Footer
  page.drawLine({ start: { x: M, y: 28 }, end: { x: PW - M, y: 28 }, thickness: 0.5, color: C.divider });
  page.drawText('HDAB-NL | Health Data Access Body Nederland | EHDS Verordening (EU) 2025/327', {
    x: M, y: 14, font: regular, size: 7, color: C.gray,
  });

  return pdfDoc.save();
}
