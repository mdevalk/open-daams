import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';

const C = {
  darkBlue: rgb(0.082, 0.259, 0.451),   // #154273
  lightBlue: rgb(0.004, 0.412, 0.608),   // #01689b
  white: rgb(1, 1, 1),
  black: rgb(0, 0, 0),
  gray: rgb(0.349, 0.349, 0.349),        // #595959
  lightGray: rgb(0.941, 0.941, 0.941),   // #f0f0f0
  green: rgb(0.102, 0.361, 0.180),       // #1a5c2e
  greenBg: rgb(0.902, 0.961, 0.918),     // #e6f5ea
  blueBg: rgb(0.91, 0.957, 0.984),       // #e8f4fb
  divider: rgb(0.816, 0.816, 0.816),     // #d0d0d0
  redText: rgb(0.478, 0.090, 0.067),     // #7a1711
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

// A4 dimensions in points (72pt = 1 inch)
const W = 595;
const H = 842;
const M = 40; // margin
const CW = W - M * 2;

function drawRect(
  page: PDFPage,
  x: number, y: number, w: number, h: number,
  color: ReturnType<typeof rgb>,
) {
  page.drawRectangle({ x, y: H - y - h, width: w, height: h, color });
}

function drawLine(
  page: PDFPage,
  x1: number, y1: number, x2: number,
  color: ReturnType<typeof rgb>,
) {
  page.drawLine({ start: { x: x1, y: H - y1 }, end: { x: x2, y: H - y1 }, thickness: 0.5, color });
}

function drawText(
  page: PDFPage,
  text: string,
  x: number, y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
  maxWidth?: number,
): number {
  // Simple word-wrap
  if (maxWidth) {
    const words = text.split(' ');
    let line = '';
    let curY = y;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      const testW = font.widthOfTextAtSize(test, size);
      if (testW > maxWidth && line) {
        page.drawText(line, { x, y: H - curY, font, size, color });
        curY += size * 1.4;
        line = word;
      } else {
        line = test;
      }
    }
    if (line) page.drawText(line, { x, y: H - curY, font, size, color });
    return curY + size * 1.4;
  }
  page.drawText(text, { x, y: H - y, font, size, color });
  return y + size * 1.4;
}

export async function generatePermitPdf(permit: PermitPdfData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Vergunning ${permit.permitNumber}`);
  pdfDoc.setAuthor('HDAB-NL');
  pdfDoc.setSubject('EHDS Dataverwerkingsvergunning');
  pdfDoc.setCreationDate(new Date());

  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([W, H]);

  // ── Header ──────────────────────────────────────────────────────────
  drawRect(page, 0, 0, W, 70, C.darkBlue);
  drawText(page, 'HDAB-NL | DAAMS', M, 20, bold, 16, C.white);
  drawText(page, 'Health Data Access Body Nederland - EHDS Dataverwerkingsvergunning', M, 42, regular, 8, rgb(0.8, 0.85, 0.9));

  let y = 88;

  // ── Permit number box ───────────────────────────────────────────────
  drawRect(page, M, y, CW, 58, C.lightGray);
  drawRect(page, M, y, 4, 58, C.darkBlue);
  drawText(page, 'VERGUNNINGSNUMMER', M + 14, y + 10, regular, 7, C.gray);
  drawText(page, permit.permitNumber, M + 14, y + 22, bold, 15, C.darkBlue);

  const statusLabel = STATUS_NL[permit.status] ?? permit.status;
  const badgeW = bold.widthOfTextAtSize(statusLabel, 7.5) + 16;
  drawRect(page, M + 14, y + 40, badgeW, 14, permit.status === 'REVOKED' ? rgb(0.988, 0.910, 0.902) : C.greenBg);
  drawText(page, statusLabel, M + 22, y + 43, bold, 7.5, permit.status === 'REVOKED' ? C.redText : C.green);

  y += 70;

  // ── Validity row ──────────────────────────────────────────────────
  const boxW = (CW - 16) / 3;
  [
    { label: 'GELDIG VANAF', value: fmt(permit.validFrom) },
    { label: 'GELDIG TOT EN MET', value: fmt(permit.validUntil) },
    { label: 'UITGEGEVEN OP', value: fmt(permit.issuedAt) },
  ].forEach((item, i) => {
    const bx = M + i * (boxW + 8);
    drawRect(page, bx, y, boxW, 46, C.lightGray);
    drawText(page, item.label, bx + 10, y + 9, regular, 7, C.gray);
    drawText(page, item.value, bx + 10, y + 22, bold, 11, C.darkBlue);
  });

  y += 58;

  const sectionTitle = (title: string) => {
    drawText(page, title, M, y, bold, 8, C.darkBlue);
    y += 13;
    drawLine(page, M, y, M + CW, C.divider);
    y += 8;
  };

  const field = (label: string, value: string) => {
    drawText(page, label, M, y, regular, 8.5, C.gray);
    const nextY = drawText(page, value, M + 155, y, bold, 8.5, C.black, CW - 155);
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
    drawText(page, permit.revocationReason, M, y, regular, 8.5, C.redText, CW);
    y += 20;
  }

  // ── Legal notice ───────────────────────────────────────────────────
  y += 4;
  drawRect(page, M, y, CW, 52, C.blueBg);
  drawRect(page, M, y, 4, 52, C.lightBlue);
  drawText(
    page,
    'Deze vergunning is afgegeven op grond van de EHDS Verordening (EU) 2025/327 en de nationale ' +
    'implementatie daarvan. De vergunning is persoonsgebonden en niet overdraagbaar. Gebruik van de ' +
    'verleende gegevens is uitsluitend toegestaan voor het omschreven doel. TEHDAS2 D6.4 par. 9.',
    M + 14, y + 10, regular, 7.5, C.darkBlue, CW - 24,
  );

  // ── Footer ───────────────────────────────────────────────────────────
  const footerY = H - 28;
  page.drawLine({ start: { x: M, y: footerY }, end: { x: W - M, y: footerY }, thickness: 0.5, color: C.divider });
  drawText(page, 'HDAB-NL | Health Data Access Body Nederland | EHDS Verordening (EU) 2025/327', M, H - footerY + 14, regular, 7, C.gray);

  return pdfDoc.save();
}
