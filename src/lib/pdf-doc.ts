import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';
import { APP_NAME } from './branding';
import { formatDateNumeric } from './utils';

// Generic PDF-building toolkit shared by every capability that renders a document (permit,
// decision, appeal) — colors, text sanitization, page layout, and the Doc primitive itself.
// Capability-specific document layout (what sections go on the page) lives with that capability,
// not here.

export const C = {
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
  '–': '-', '—': '-', '…': '...', '•': '-',
  ' ': ' ',
};

// Built from WINANSI_REPLACEMENTS' own keys so every mapped character is
// actually matched — a hand-duplicated character class silently drops
// replacements added to the map but not the regex (as happened with '•').
const WINANSI_REPLACEMENT_PATTERN = new RegExp(
  `[${Object.keys(WINANSI_REPLACEMENTS).map((ch) => `\\u{${ch.codePointAt(0)!.toString(16)}}`).join('')}]`,
  'gu',
);

function sanitizeText(str: string): string {
  const replaced = str.replace(WINANSI_REPLACEMENT_PATTERN, (ch) => WINANSI_REPLACEMENTS[ch] ?? ch);
  // € (U+20AC) sits outside Latin-1 but WinAnsiEncoding (used by pdf-lib's
  // standard fonts) can render it directly, so it's exempted from the filter
  // below rather than being replaced like the truly unsupported characters.
  // eslint-disable-next-line no-control-regex
  return replaced.replace(/[^\x00-\xFF€]/g, '?');
}

export const fmt = formatDateNumeric;

export const PW = 595; // A4 width in points
const PH = 842; // A4 height in points
export const M = 40;   // margin
const CW = PW - M * 2;
const BOTTOM = PH - 50;

export class Doc {
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
    this.page.drawLine({ start: { x: M, y: 40 }, end: { x: PW - M, y: 40 }, thickness: 0.5, color: C.divider });
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
