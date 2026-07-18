import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';
import { APP_NAME } from './branding';
import { formatPermitId } from './permit';

// Layout follows TEHDAS2 D6.3 "Guideline for Health Data Access Bodies on the
// procedures and formats for data access", Annex 9 - Data permit template
// (17 September 2025, accepted by TEHDAS2 Project Steering Group 11 Sep 2025).
// Section numbers/headings below (1-10, 6.1-6.8) mirror the Annex 9 structure.

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
  placeholder: rgb(0.55, 0.55, 0.55),
};

// pdf-lib's standard fonts use WinAnsi encoding (roughly Latin-1) and throw on
// anything outside it (e.g. ≥, ≤, curly quotes, em dashes) — free-text fields
// from the database can contain such characters, so normalise them here.
const WINANSI_REPLACEMENTS: Record<string, string> = {
  '≥': '>=', '≤': '<=', '≠': '!=',
  '‘': "'", '’': "'", '“': '"', '”': '"',
  '–': '-', '—': '-', '…': '...',
  ' ': ' ',
};

function sanitizeText(str: string): string {
  const replaced = str.replace(
    /[≥≤≠‘’“”–—… ]/g,
    (ch) => WINANSI_REPLACEMENTS[ch] ?? ch,
  );
  // eslint-disable-next-line no-control-regex
  return replaced.replace(/[^\x00-\xFF]/g, '?');
}

function fmtMoney(v: unknown, currency: string): string | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency }).format(n);
}

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
  version: number;
  status: string;
  issuedAt: Date | null;
  validFrom: Date | null;
  validUntil: Date | null;
  previousPermitId?: string | null;
  previousPermit?: { permitNumber: string; version: number } | null;
  revocationReason?: string | null;
  revocationAt?: Date | null;
  currency?: string | null;
  permitProcessingFee?: unknown;
  dataPreparationFee?: unknown;
  speSetupFee?: unknown;
  speUsageFee?: unknown;
  additionalServicesFee?: unknown;
  dataHolderFee?: unknown;
  paymentTerms?: string | null;
  authorizedPersons?: Array<{ name: string; affiliation: string; email: string }> | null;
  application: {
    referenceNumber: string;
    title: string;
    type: string;
    submittedAt?: Date | null;
    decisionSummary?: string | null;
    projectDescription?: string | null;
    purposeCategory?: string | null;
    requestedDatasets?: string[] | null;
    requestedVariables?: string | null;
    studyPopulation?: string | null;
    inclusionCriteria?: string | null;
    exclusionCriteria?: string | null;
    ethicalReviewRequired?: boolean | null;
    ethicalReviewStatus?: string | null;
    ethicalReviewBody?: string | null;
    ethicalReviewReference?: string | null;
    ethicalReviewDate?: Date | null;
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

  newPage() {
    this.page = this.pdfDoc.addPage([PW, PH]);
    this.pageNum += 1;
    this.y = 40;
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
    rawStr: string, x: number, y: number, font: PDFFont, size: number,
    color: ReturnType<typeof rgb>, maxWidth?: number,
  ): number {
    const str = sanitizeText(rawStr);
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

  paragraph(rawStr: string, opts: { size?: number; color?: ReturnType<typeof rgb>; indent?: number; font?: PDFFont } = {}) {
    const { size = 8.5, color = C.black, indent = 0, font = this.regular } = opts;
    const lineH = size * 1.4;
    const words = sanitizeText(rawStr).replace(/\s+/g, ' ').trim().split(' ');
    const maxWidth = CW - indent;
    let line = '';
    const lines: string[] = [];
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    for (const l of lines) {
      this.ensureSpace(lineH);
      this.page.drawText(l, { x: M + indent, y: PH - this.y - size, font, size, color });
      this.y += lineH;
    }
  }

  placeholder(str: string, indent = 0) {
    this.paragraph(`[${str}]`, { size: 8, color: C.placeholder, indent, font: this.italic });
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

  bullet(str: string) {
    this.paragraph(`•  ${str}`, { indent: 4 });
  }

  spacer(h = 8) {
    this.y += h;
  }

  footer() {
    this.page.drawLine({ start: { x: M, y: PH - 40 }, end: { x: PW - M, y: PH - 40 }, thickness: 0.5, color: C.divider });
    this.page.drawText(
      'Demo-document uit een open-sourceproject — HDAB-NL is een fictieve organisatie, dit is geen officieel EHDS-document.',
      { x: M, y: 12, font: this.italic, size: 6.5, color: C.placeholder },
    );
    this.page.drawText(`${APP_NAME} | Health Data Access Body Nederland (HDAB-NL) | EHDS Verordening (EU) 2025/327`, {
      x: M, y: 24, font: this.regular, size: 7, color: C.gray,
    });
    this.page.drawText(`Pagina ${this.pageNum}`, {
      x: PW - M - 40, y: 24, font: this.regular, size: 7, color: C.gray,
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
  const permitId = formatPermitId(permit.permitNumber, permit.version);
  doc.pdfDoc.setTitle(`Vergunning ${permitId}`);
  doc.pdfDoc.setAuthor(APP_NAME);
  doc.pdfDoc.setSubject('EHDS Dataverwerkingsvergunning');
  doc.pdfDoc.setCreationDate(new Date());

  const app = permit.application;
  const isRevoked = permit.status === 'REVOKED';
  const isAmendment = !!permit.previousPermit;
  const isDataRequest = app?.type === 'DATA_REQUEST';
  const statusLabel = STATUS_NL[permit.status] ?? permit.status;

  doc.newPage();

  // Running header, per Annex 9 top block
  doc.rect(0, 0, PW, 62, C.darkBlue);
  doc.text('BESLUIT', M, 12, doc.bold, 15, C.white);
  doc.text(`Dossier- / vergunningsnummer: ${permitId}`, M, 32, doc.regular, 8.5, rgb(0.85, 0.9, 0.95));
  doc.text('Health Data Access Body Nederland (HDAB-NL) | Nederland', M, 44, doc.regular, 8.5, rgb(0.85, 0.9, 0.95));
  doc.y = 78;

  const badgeW = doc.bold.widthOfTextAtSize(statusLabel, 8) + 16;
  doc.rect(M, doc.y, badgeW, 15, isRevoked ? C.redBg : C.greenBg);
  doc.text(statusLabel, M + 8, doc.y + 4, doc.bold, 8, isRevoked ? C.redText : C.green);
  doc.text(`Datum van afgifte: ${fmt(permit.issuedAt)}`, M + badgeW + 12, doc.y + 4, doc.regular, 8, C.gray);
  doc.y += 22;

  doc.paragraph(
    `Uw aanvraag ${app?.referenceNumber ?? '—'}, ingediend op ${fmt(app?.submittedAt)}.`,
    { size: 8, color: C.gray, font: doc.italic },
  );
  doc.paragraph(
    isDataRequest ? 'Besluit op gezondheidsgegevensverzoek' : 'Dataverwerkingsvergunning / besluit op gezondheidsgegevensaanvraag',
    { size: 8, color: C.gray, font: doc.italic },
  );
  doc.spacer(6);

  // 1. Issuing authority
  doc.heading('1', 'AFGEVENDE AUTORITEIT');
  doc.field('Naam', 'Health Data Access Body Nederland (HDAB-NL)');
  doc.field('Contactgegevens', 'info@hdab.nl');
  doc.spacer(6);
  doc.text('Ondertekening:', M, doc.y, doc.regular, 8.5, C.gray);
  doc.y += 16;
  doc.page.drawLine({ start: { x: M, y: PH - doc.y }, end: { x: M + 200, y: PH - doc.y }, thickness: 0.6, color: C.divider });
  doc.y += 4;
  doc.spacer(8);

  // 2. Health data user / applicant
  doc.heading('2', 'GEZONDHEIDSGEGEVENSGEBRUIKER / AANVRAGER');
  if (app) {
    doc.field('Type gebruiker', 'Rechtspersoon (met vertegenwoordiger)');
    doc.field('Naam organisatie', app.applicant.organisation);
    doc.field('Vertegenwoordiger (naam)', app.applicant.name);
    doc.field('E-mail', app.applicant.email);
    if (app.purposeCategory === 'SCIENTIFIC_RESEARCH') {
      doc.field('Hoofdonderzoeker', app.applicant.name);
    }
    doc.field('Verwerkingsverantwoordelijke', app.applicant.organisation);
  }
  doc.spacer(4);

  // 3. Reference
  doc.heading('3', 'REFERENTIE');
  doc.field('Projecttitel', app?.title ?? '—');
  doc.field('Vergunningsnummer / dossiernummer', permitId);
  doc.field('Aanvraagreferentie', app?.referenceNumber ?? '—');
  if (permit.previousPermit) {
    doc.field('Eerdere vergunning', formatPermitId(permit.previousPermit.permitNumber, permit.previousPermit.version));
  }
  doc.spacer(4);

  // 4. Subject
  doc.heading('4', 'ONDERWERP');
  doc.paragraph(
    `De gezondheidsgegevensgebruiker heeft bij HDAB-NL een aanvraag ingediend voor het project ` +
    `"${app?.title ?? '—'}" op grond van artikel ${isDataRequest ? '69' : '67'} van Verordening (EU) 2025/327 ` +
    `van het Europees Parlement en de Raad betreffende de Europese ruimte voor gezondheidsgegevens ` +
    `(hierna: EHDS).`,
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
      'Op grond van de EHDS trekt HDAB-NL de aan de gezondheidsgegevensgebruiker verleende vergunning in.',
      { color: C.redText },
    );
    doc.field('Datum intrekking', fmt(permit.revocationAt));
    if (permit.revocationReason) {
      doc.spacer(6);
      doc.paragraph(`Reden van intrekking: ${permit.revocationReason}`, { color: C.redText });
    }
  } else {
    doc.paragraph(
      `Op grond van de EHDS verleent HDAB-NL de gezondheidsgegevensgebruiker ${isDataRequest ? 'de goedkeuring om een antwoord te ontvangen' : 'de vergunning om de in dit besluit bedoelde gegevens te verwerken'}, ` +
      `overeenkomstig artikel ${isDataRequest ? '69' : '68, lid 3,'} EHDS. ${isDataRequest ? 'De goedkeuring' : 'De vergunning'} wordt verleend voor het project ` +
      `zoals beschreven in de aanvraag. HDAB-NL is van oordeel dat is voldaan aan de vereisten van artikel ` +
      `${isDataRequest ? '69' : '68, lid 1,'} EHDS en dat de risico's bedoeld in artikel 68, lid 2, voldoende zijn beperkt. ` +
      `De gevraagde gegevens zijn bovendien noodzakelijk, adequaat en evenredig voor de in de aanvraag ` +
      `beschreven doeleinden.`,
    );
    if (app?.decisionSummary) {
      doc.spacer(6);
      doc.paragraph(app.decisionSummary);
    }
    doc.spacer(8);
    if (isAmendment) {
      doc.paragraph('Deze vergunning betreft een wijziging (amendement) van een eerder verleende vergunning.', { color: C.gray, size: 8 });
      doc.spacer(4);
    }
    doc.field('Toegangsperiode (SPE)', `${fmt(permit.validFrom)} — ${fmt(permit.validUntil)}`);
    doc.field('Bewaartermijn in de SPE', `Verwijdering uiterlijk 6 maanden na ${fmt(permit.validUntil)} (Art. 68, lid 12, EHDS)`);
    if (app?.dataStartDate || app?.dataEndDate) {
      doc.field('Periode brongegevens', `${fmt(app?.dataStartDate)} — ${fmt(app?.dataEndDate)}`);
    }

    doc.spacer(6);
    doc.placeholder('Handelsgeheimen / intellectuele-eigendomsrechten: nog niet geregistreerd — vul aan indien van toepassing (Art. 52 EHDS)');
    doc.placeholder('Uitzondering opt-out mechanisme: nog niet geregistreerd — vul aan indien van toepassing (Art. 71, lid 4, EHDS)');
    if (app?.isCrossBorder) {
      doc.spacer(4);
      doc.paragraph(
        `Dit betreft een grensoverschrijdende aanvraag. Gegevens worden mede verwerkt in samenwerking met ` +
        `de bevoegde autoriteit(en) van: ${app.dataProcessingCountry ?? '—'} (Art. 76 EHDS).`,
      );
      doc.placeholder('Wederzijdse erkenning van een door een andere HDAB verleende vergunning: nog niet geregistreerd');
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
  doc.spacer(4);
  doc.placeholder('Indien beoordeeld door een trusted health data holder (Art. 72, lid 2 en 4, EHDS): naam, verwijzingsbesluit en datum van het advies nog niet geregistreerd');
  doc.spacer(6);

  doc.subheading('6.2  Ontvangen verklaringen');
  if (app?.ethicalReviewRequired && app.ethicalReviewStatus && app.ethicalReviewStatus !== 'NOT_REQUIRED') {
    const ETHICAL_STATUS_NL: Record<string, string> = {
      PENDING: 'in afwachting',
      APPROVED: 'goedgekeurd',
      REJECTED: 'afgewezen',
    };
    doc.field('Ethische toetsing', ETHICAL_STATUS_NL[app.ethicalReviewStatus] ?? app.ethicalReviewStatus);
    if (app.ethicalReviewBody) doc.field('Toetsingscommissie', app.ethicalReviewBody);
    if (app.ethicalReviewReference) doc.field('Referentie', app.ethicalReviewReference);
    if (app.ethicalReviewDate) doc.field('Datum', fmt(app.ethicalReviewDate));
  } else {
    doc.paragraph('Voor dit project is geen ethische toetsing vereist gesteld.', { size: 8, color: C.gray });
  }
  doc.spacer(4);
  doc.placeholder('Overzicht van overige relevante vergunningen e.d. (afgevende autoriteit, dossiernummer, datum van afgifte) — nog niet geregistreerd in DAAMS');
  doc.spacer(6);

  doc.subheading('6.3  Beschrijving van het doel van gebruik');
  const purposeText = app?.purposeCategory
    ? (PURPOSE_LABELS[app.purposeCategory] ?? app.purposeCategory)
    : '—';
  doc.paragraph(`HDAB-NL verleent ${isDataRequest ? 'de goedkeuring' : 'de vergunning'} voor het volgende doeleinde: ${purposeText}.`);
  if (app?.legalBasis) {
    doc.spacer(4);
    doc.field('Rechtsgrondslag', app.legalBasis);
  }
  doc.spacer(4);
  doc.paragraph('De reikwijdte en doelstellingen van het project zijn getoetst en in lijn bevonden met de EHDS.');
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
  doc.spacer(4);
  doc.paragraph(
    `De gegevens worden verstrekt in ${isDataRequest ? 'geanonimiseerd, geaggregeerd statistisch' : 'geanonimiseerd of gepseudonimiseerd individueel-niveau'} formaat.`,
  );
  doc.spacer(4);
  doc.paragraph('Een gedetailleerde beschrijving van de op grond van deze vergunning verstrekte gegevens is opgenomen in bijlage 1.', { size: 8, color: C.gray });
  doc.spacer(6);

  doc.subheading('6.5  Voorbereiding en verstrekking van de gegevens');
  doc.paragraph(
    'HDAB-NL combineert, bewerkt en anonimiseert/pseudonimiseert de gegevens voorafgaand aan verstrekking.',
  );
  doc.placeholder('Indien voorbereiding is uitgevoerd door een trusted health data holder (Art. 72, lid 6, EHDS): naam nog niet geregistreerd');
  doc.spacer(6);

  if (!isDataRequest) {
    doc.subheading('6.6  Beveiligde verwerkingsomgeving');
    doc.paragraph(
      'De op grond van deze vergunning verstrekte gegevens worden uitsluitend beschikbaar gesteld in ' +
      'een beveiligde verwerkingsomgeving (Secure Processing Environment, SPE) die voldoet aan de ' +
      'technische en organisatorische eisen van artikel 73 EHDS.',
    );
    doc.spacer(4);
    doc.placeholder('Naam van de toegewezen SPE en technische kenmerken/tools — nog niet geregistreerd in DAAMS');
    doc.spacer(4);
    doc.paragraph(
      'De gezondheidsgegevensgebruiker is verantwoordelijk voor naleving van de EHDS-voorwaarden en ' +
      'toepasselijke wetgeving (o.a. AVG), en voor het voorkomen van verboden gebruik zoals ' +
      're-identificatie of ongeautoriseerde doorgifte van gegevens. Alleen anonieme resultaten mogen ' +
      'uit de SPE worden geëxporteerd.',
    );
    doc.spacer(6);
  }

  doc.subheading('6.7  Totstandkoming van anonieme resultaten');
  doc.paragraph(
    isDataRequest
      ? 'HDAB-NL produceert de geaggregeerde statistische gegevens conform het bij de aanvraag ingediende tabulatieplan. De gezondheidsgegevensgebruiker heeft geen toegang tot de onderliggende individuele gegevens.'
      : 'Uitsluitend geaggregeerde en geanonimiseerde resultaten mogen door de gezondheidsgegevensgebruiker uit de SPE worden geëxporteerd, conform de richtlijnen van HDAB-NL voor disclosure control.',
  );
  doc.spacer(6);

  doc.subheading('6.8  Personen die gemachtigd zijn de gegevens te verwerken');
  if (permit.authorizedPersons && permit.authorizedPersons.length > 0) {
    for (const person of permit.authorizedPersons) {
      doc.bullet(`${person.name} — ${person.affiliation} (${person.email})`);
    }
  } else {
    doc.placeholder('Lijst van gemachtigde personen (naam, affiliatie, e-mailadres) — nog niet geregistreerd in DAAMS');
  }
  doc.spacer(4);

  // 7. Fees
  doc.heading('7', 'KOSTEN VOOR VERGUNNING EN GEGEVENSVERWERKING');
  {
    const currency = permit.currency ?? 'EUR';
    const feeLines: Array<[string, unknown]> = [
      ['Behandelkosten vergunning', permit.permitProcessingFee],
      ['Kosten gegevensvoorbereiding', permit.dataPreparationFee],
      ...(!isDataRequest ? ([
        ['SPE opstartkosten', permit.speSetupFee],
        ['SPE gebruikskosten', permit.speUsageFee],
      ] as Array<[string, unknown]>) : []),
      ['Aanvullende diensten', permit.additionalServicesFee],
      ['Kosten gegevenshouder(s)', permit.dataHolderFee],
    ];
    const known = feeLines.filter(([, v]) => fmtMoney(v, currency) !== null);

    if (known.length > 0) {
      doc.paragraph(`Kosten worden vermeld in ${currency}, conform artikel 62 EHDS.`, { size: 8, color: C.gray });
      doc.spacer(4);
      let total = 0;
      for (const [label, v] of known) {
        const formatted = fmtMoney(v, currency)!;
        total += Number(v);
        doc.field(label, formatted);
      }
      doc.spacer(2);
      doc.field('Totaal', fmtMoney(total, currency) ?? '—');
      if (permit.paymentTerms) {
        doc.spacer(4);
        doc.paragraph(permit.paymentTerms, { size: 8 });
      }
    } else {
      doc.paragraph(`Kosten worden vermeld in ${currency}, conform artikel 62 EHDS.`, { size: 8, color: C.gray });
      doc.spacer(4);
      doc.bullet('Behandelkosten vergunning: mogelijk reeds voldaan bij indiening van de aanvraag');
      doc.bullet('Kosten gegevensvoorbereiding (anonimisering, pseudonimisering, koppeling, variabelenselectie)');
      if (!isDataRequest) {
        doc.bullet('SPE-gebruikskosten: opstartkosten en doorlopende gebruikskosten (opslag, rekencapaciteit)');
      }
      doc.bullet('Aanvullende diensten (technische ondersteuning, aanpassingen aan variabelen)');
      doc.bullet('Kosten in rekening gebracht door gegevenshouders');
      doc.spacer(4);
      doc.placeholder('Bedragen, betalingstermijnen en eventuele kortingen/vrijstellingen — nog niet geregistreerd in DAAMS');
    }
  }
  doc.spacer(4);

  // 8. Applicable legislation
  doc.heading('8', 'TOEPASSELIJKE WETGEVING');
  doc.bullet('Verordening (EU) 2025/327 van het Europees Parlement en de Raad (EHDS-verordening)');
  doc.bullet('Verordening (EU) 2016/679 (Algemene Verordening Gegevensbescherming / GDPR)');
  doc.bullet('Nederlandse uitvoeringswetgeving EHDS');
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
  doc.bullet('Bijlage 1 — Gedetailleerde beschrijving van de verstrekte gegevens');
  doc.bullet('Bijlage 2 — Lijst van personen gemachtigd tot gegevensverwerking');
  doc.bullet('Bijlage 3 — Algemene voorwaarden HDAB-NL');

  doc.footer();

  return doc.pdfDoc.save();
}
