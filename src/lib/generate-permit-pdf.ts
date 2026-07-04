import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';

// Layout follows TEHDAS2 D6.3 "Guideline for Health Data Access Bodies on the
// procedures and formats for data access", Annex 9 - Data permit template
// (17 September 2025, accepted by TEHDAS2 Project Steering Group 11 Sep 2025).

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
  amberText: rgb(0.541, 0.361, 0.024),
  amberBg: rgb(0.996, 0.953, 0.831),
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
    projectDescription?: string | null;
    purposeCategory?: string | null;
    requestedDatasets?: string[] | null;
    requestedVariables?: string | null;
    studyPopulation?: string | null;
    inclusionCriteria?: string | null;
    exclusionCriteria?: string | null;
    dataStartDate?: Date | null;
    dataEndDate?: Date | null;
    legalBasis?: string | null;
    dataProcessingCountry?: string | null;
    isCrossBorder?: boolean | null;
    applicant: { name: string; organisation: string; email: string };
  } | null;
};

const PW = 595; // A4 width in points
const PH = 842; // A4 height in points
const M = 40;   // margin
const CW = PW - M * 2;
const BOTTOM = PH - 50;

class Doc {
  pdfDoc!: PDFDocument;
  regular!: PDFFont;
  bold!: PDFFont;
  italic!: PDFFont;
  page!: PDFPage;
  y = 0;
  pageNum = 0;

  async init() {
    this.pdfDoc = await PDFDocument.create();
    this.regular = await this.pdfDoc.embedFont(StandardFonts.Helvetica);
    this.bold = await this.pdfDoc.embedFont(StandardFonts.HelveticaBold);
    this.italic = await this.pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  }

  newPage(withHeader = true) {
    this.page = this.pdfDoc.addPage([PW, PH]);
    this.pageNum += 1;
    this.y = 40;
    if (!withHeader) return;
  }

  ensureSpace(needed: number) {
    if (this.y + needed > BOTTOM) {
      this.footer();
      this.newPage();
    }
  }

  rect(x: number, y: number, w: number, h: number, color: ReturnType<typeof rgb>) {
    this.page.drawRectangle({ x, y: PH - y - h, width: w, height: h, color });
  }

  text(
    str: string, x: number, y: number, font: PDFFont, size: number,
    color: ReturnType<typeof rgb>, maxWidth?: number,
  ): number {
    if (!maxWidth) {
      this.page.drawText(str, { x, y: PH - y - size, font, size, color });
      return y + size * 1.4;
    }
    const words = str.split(' ');
    let line = '';
    let curY = y;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
        this.page.drawText(line, { x, y: PH - curY - size, font, size, color });
        curY += size * 1.4;
        line = word;
      } else {
        line = test;
      }
    }
    if (line) this.page.drawText(line, { x, y: PH - curY - size, font, size, color });
    return curY + size * 1.4;
  }

  paragraph(str: string, size = 8.5, color = C.black, indent = 0) {
    const lineH = size * 1.4;
    const words = str.replace(/\s+/g, ' ').trim().split(' ');
    const maxWidth = CW - indent;
    let line = '';
    const lines: string[] = [];
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (this.regular.widthOfTextAtSize(test, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    for (const l of lines) {
      this.ensureSpace(lineH);
      this.page.drawText(l, { x: M + indent, y: PH - this.y - size, font: this.regular, size, color });
      this.y += lineH;
    }
  }

  heading(num: string, title: string) {
    this.ensureSpace(28);
    this.y += 6;
    this.rect(M, this.y, CW, 20, C.darkBlue);
    this.text(`${num}  ${title}`, M + 8, this.y + 5, this.bold, 9.5, C.white);
    this.y += 28;
  }

  subheading(title: string) {
    this.ensureSpace(18);
    this.text(title, M, this.y, this.bold, 8.5, C.darkBlue);
    this.y += 14;
  }

  field(label: string, value: string, labelWidth = 160) {
    if (!value) return;
    const clean = value.replace(/\s+/g, ' ').trim();
    this.ensureSpace(14);
    const startY = this.y;
    this.text(label, M, this.y, this.regular, 8.5, C.gray);
    const nextY = this.text(clean, M + labelWidth, startY, this.bold, 8.5, C.black, CW - labelWidth);
    this.y = Math.max(startY + 13, nextY) + 2;
  }

  spacer(h = 8) {
    this.y += h;
  }

  footer() {
    this.page.drawLine({ start: { x: M, y: PH - 32 }, end: { x: PW - M, y: PH - 32 }, thickness: 0.5, color: C.divider });
    this.page.drawText('HDAB-NL | Health Data Access Body Nederland | EHDS Verordening (EU) 2025/327', {
      x: M, y: 20, font: this.regular, size: 7, color: C.gray,
    });
    this.page.drawText(`Pagina ${this.pageNum}`, {
      x: PW - M - 40, y: 20, font: this.regular, size: 7, color: C.gray,
    });
  }
}

const PURPOSE_LABELS: Record<string, string> = {
  PUBLIC_HEALTH: 'algemeen belang op het gebied van volksgezondheid (Art. 53(1)(a) EHDS)',
  POLICY_MAKING: 'beleidsvorming en regelgevende activiteiten (Art. 53(1)(b) EHDS)',
  STATISTICS: 'statistiek (Art. 53(1)(c) EHDS)',
  EDUCATION: 'onderwijs- of opleidingsactiviteiten (Art. 53(1)(d) EHDS)',
  SCIENTIFIC_RESEARCH: 'wetenschappelijk onderzoek (Art. 53(1)(e) EHDS)',
  CARE_IMPROVEMENT: 'verbetering van zorgverlening en behandeling (Art. 53(1)(f) EHDS)',
};

export async function generatePermitPdf(permit: PermitPdfData): Promise<Uint8Array> {
  const doc = new Doc();
  await doc.init();
  doc.pdfDoc.setTitle(`Vergunning ${permit.permitNumber}`);
  doc.pdfDoc.setAuthor('HDAB-NL');
  doc.pdfDoc.setSubject('EHDS Dataverwerkingsvergunning');
  doc.pdfDoc.setCreationDate(new Date());

  const app = permit.application;
  const isRevoked = permit.status === 'REVOKED';
  const statusLabel = STATUS_NL[permit.status] ?? permit.status;

  doc.newPage();

  // Decision header block, per Annex 9 running header
  doc.rect(0, 0, PW, 62, C.darkBlue);
  doc.text('BESLUIT', M, 12, doc.bold, 15, C.white);
  doc.text(`Kenmerk / vergunningsnummer: ${permit.permitNumber}`, M, 32, doc.regular, 8.5, rgb(0.85, 0.9, 0.95));
  doc.text('Health Data Access Body Nederland (HDAB-NL)', M, 44, doc.regular, 8.5, rgb(0.85, 0.9, 0.95));
  doc.y = 78;

  const badgeW = doc.bold.widthOfTextAtSize(statusLabel, 8) + 16;
  doc.rect(M, doc.y, badgeW, 15, isRevoked ? C.redBg : C.greenBg);
  doc.text(statusLabel, M + 8, doc.y + 4, doc.bold, 8, isRevoked ? C.redText : C.green);
  doc.text(`Datum van afgifte: ${fmt(permit.issuedAt)}`, M + badgeW + 12, doc.y + 4, doc.regular, 8, C.gray);
  doc.y += 26;

  // 1. Issuing authority
  doc.heading('1', 'AFGEVENDE AUTORITEIT');
  doc.field('Naam', 'Health Data Access Body Nederland (HDAB-NL)');
  doc.field('Contactgegevens', 'info@hdab.nl');
  doc.spacer(4);

  // 2. Health data user / applicant
  doc.heading('2', 'GEZONDHEIDSGEGEVENSGEBRUIKER / AANVRAGER');
  if (app) {
    doc.field('Naam', app.applicant.name);
    doc.field('Organisatie', app.applicant.organisation);
    doc.field('E-mail', app.applicant.email);
  }
  doc.spacer(4);

  // 3. Reference
  doc.heading('3', 'REFERENTIE');
  doc.field('Projecttitel', app?.title ?? '—');
  doc.field('Vergunningsnummer / dossiernummer', permit.permitNumber);
  doc.field('Aanvraagreferentie', app?.referenceNumber ?? '—');
  doc.spacer(4);

  // 4. Subject
  doc.heading('4', 'ONDERWERP');
  doc.paragraph(
    `De gezondheidsgegevensgebruiker heeft bij HDAB-NL een aanvraag ingediend voor het project ` +
    `"${app?.title ?? '—'}" op grond van artikel 67 van Verordening (EU) 2025/327 van het Europees ` +
    `Parlement en de Raad betreffende de Europese ruimte voor gezondheidsgegevens (hierna: EHDS).`,
  );
  if (app?.projectDescription) {
    doc.spacer(6);
    doc.paragraph(app.projectDescription);
  }
  doc.spacer(4);

  // 5. Decision
  doc.heading('5', 'BESLUIT');
  if (isRevoked) {
    doc.paragraph(
      `Op grond van de EHDS trekt HDAB-NL de aan de gezondheidsgegevensgebruiker verleende vergunning in.`,
      8.5, C.redText,
    );
    if (permit.revocationReason) {
      doc.spacer(6);
      doc.paragraph(`Reden van intrekking: ${permit.revocationReason}`, 8.5, C.redText);
    }
  } else {
    doc.paragraph(
      `Op grond van de EHDS verleent HDAB-NL de gezondheidsgegevensgebruiker de vergunning om de in ` +
      `dit besluit bedoelde gegevens te verwerken, overeenkomstig artikel 68, lid 3, EHDS. De vergunning ` +
      `wordt verleend voor het project zoals beschreven in de aanvraag. HDAB-NL is van oordeel dat is ` +
      `voldaan aan de vereisten van artikel 68, lid 1, EHDS en dat de risico's bedoeld in artikel 68, lid 2, ` +
      `voldoende zijn beperkt. De gevraagde gegevens zijn bovendien noodzakelijk, adequaat en evenredig ` +
      `voor de in de aanvraag beschreven doeleinden.`,
    );
    doc.spacer(8);
    doc.field('Geldig vanaf', fmt(permit.validFrom));
    doc.field('Geldig tot en met', fmt(permit.validUntil));
    if (app?.dataStartDate || app?.dataEndDate) {
      doc.field(
        'Periode gegevensverwerking',
        `${fmt(app?.dataStartDate)} — ${fmt(app?.dataEndDate)}`,
      );
    }
  }
  doc.spacer(4);

  // 6. Justifications
  doc.heading('6', 'MOTIVERING VAN HET BESLUIT');

  doc.subheading('6.1  Bevoegdheid van HDAB-NL');
  doc.paragraph(
    'HDAB-NL is de door Nederland aangewezen bevoegde autoriteit voor de behandeling van ' +
    'gezondheidsgegevensaanvragen en -verzoeken op grond van artikel 55 EHDS en de Nederlandse ' +
    'uitvoeringswetgeving.',
  );
  doc.spacer(6);

  doc.subheading('6.3  Beschrijving van het doel van gebruik');
  const purposeText = app?.purposeCategory
    ? (PURPOSE_LABELS[app.purposeCategory] ?? app.purposeCategory)
    : '—';
  doc.paragraph(`HDAB-NL verleent de vergunning voor het volgende doeleinde: ${purposeText}.`);
  if (app?.legalBasis) {
    doc.spacer(4);
    doc.field('Rechtsgrondslag', app.legalBasis);
  }
  doc.spacer(6);

  doc.subheading('6.4  Gegevens die op grond van de vergunning worden verstrekt');
  if (app?.requestedDatasets?.length) {
    doc.field('Datasets', app.requestedDatasets.join(', '));
  }
  if (app?.requestedVariables) {
    doc.field('Gevraagde variabelen', app.requestedVariables);
  }
  if (app?.studyPopulation) {
    doc.field('Studiepopulatie', app.studyPopulation);
  }
  if (app?.inclusionCriteria) {
    doc.field('Inclusiecriteria', app.inclusionCriteria);
  }
  if (app?.exclusionCriteria) {
    doc.field('Exclusiecriteria', app.exclusionCriteria);
  }
  if (app?.dataProcessingCountry) {
    doc.field('Land van gegevensverwerking', app.dataProcessingCountry);
  }
  if (app?.isCrossBorder) {
    doc.spacer(4);
    doc.paragraph(
      'Dit betreft een grensoverschrijdende aanvraag; de gegevens worden mede verwerkt in ' +
      'samenwerking met de bevoegde autoriteit(en) van het/de betrokken lidsta(a)t(en) ' +
      '(Art. 76 EHDS).',
    );
  }
  doc.spacer(6);

  doc.subheading('6.6  Beveiligde verwerkingsomgeving');
  doc.paragraph(
    'De op grond van deze vergunning verstrekte gegevens worden uitsluitend beschikbaar gesteld in ' +
    'een beveiligde verwerkingsomgeving (Secure Processing Environment, SPE) die voldoet aan de ' +
    'technische en organisatorische eisen van artikel 73 EHDS. Alleen anonieme resultaten mogen uit ' +
    'de SPE worden geëxporteerd.',
  );
  doc.spacer(4);

  // 7. Fees
  doc.heading('7', 'KOSTEN VOOR VERGUNNING EN GEGEVENSVERWERKING');
  doc.paragraph(
    'De aan deze vergunning verbonden kosten (behandelkosten, kosten voor gegevensvoorbereiding en ' +
    'gebruik van de beveiligde verwerkingsomgeving) worden separaat aan de gezondheidsgegevensgebruiker ' +
    'gefactureerd, conform artikel 62 EHDS.',
  );
  doc.spacer(4);

  // 8. Applicable legislation
  doc.heading('8', 'TOEPASSELIJKE WETGEVING');
  doc.paragraph('- Verordening (EU) 2025/327 (EHDS-verordening)');
  doc.paragraph('- Verordening (EU) 2016/679 (AVG/GDPR)');
  doc.paragraph('- Nederlandse uitvoeringswetgeving EHDS');
  doc.spacer(4);

  // 9. Redress mechanisms
  doc.heading('9', 'RECHTSMIDDELEN');
  doc.paragraph(
    'Tegen dit besluit kan bezwaar worden gemaakt en, aansluitend, beroep worden ingesteld bij de ' +
    'bevoegde Nederlandse bestuursrechter, overeenkomstig de Algemene wet bestuursrecht.',
  );
  doc.spacer(4);

  // 10. Appendices
  doc.heading('10', 'BIJLAGEN');
  doc.paragraph('Geen bijlagen bijgevoegd bij dit besluit.');

  doc.footer();

  return doc.pdfDoc.save();
}
