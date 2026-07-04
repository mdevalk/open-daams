const DARK_BLUE = '#154273';
const LIGHT_BLUE = '#01689b';
const GRAY = '#595959';
const LIGHT_GRAY = '#f0f0f0';
const GREEN = '#1a5c2e';

function fmt(d: Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
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
    applicant: {
      name: string;
      organisation: string;
      email: string;
    };
  } | null;
};

export async function generatePermitPdf(permit: PermitPdfData): Promise<Buffer> {
  const PDFDocumentModule = await import('pdfkit');
  const PDFDocument = PDFDocumentModule.default as typeof import('pdfkit');

  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = new (PDFDocument as any)({ size: 'A4', margin: 0 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width as number;
    const M = 40;
    const CW = W - M * 2;

    // Header
    doc.rect(0, 0, W, 70).fill(DARK_BLUE);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16).text('HDAB-NL | DAAMS', M, 18);
    doc
      .fillColor('#ffffffaa')
      .font('Helvetica')
      .fontSize(8.5)
      .text('Health Data Access Body Nederland — EHDS Dataverwerkingsvergunning', M, 40);

    let y = 90;

    // Permit number box
    doc.rect(M, y, CW, 56).fill(LIGHT_GRAY);
    doc.rect(M, y, 4, 56).fill(DARK_BLUE);
    doc.fillColor(GRAY).font('Helvetica').fontSize(7.5).text('VERGUNNINGSNUMMER', M + 14, y + 10);
    doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(15).text(permit.permitNumber, M + 14, y + 22);

    const statusLabel = STATUS_NL[permit.status] ?? permit.status;
    const badgeW = statusLabel.length * 5.5 + 16;
    doc.roundedRect(M + 14, y + 40, badgeW, 14, 3).fill('#e6f5ea');
    doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(7.5).text(statusLabel, M + 22, y + 43);

    y += 72;

    // Validity boxes
    const boxW = (CW - 16) / 3;
    [
      { label: 'GELDIG VANAF', value: fmt(permit.validFrom) },
      { label: 'GELDIG TOT EN MET', value: fmt(permit.validUntil) },
      { label: 'UITGEGEVEN OP', value: fmt(permit.issuedAt) },
    ].forEach((item, i) => {
      const bx = M + i * (boxW + 8);
      doc.rect(bx, y, boxW, 44).fill(LIGHT_GRAY);
      doc.fillColor(GRAY).font('Helvetica').fontSize(7).text(item.label, bx + 10, y + 8);
      doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(11).text(item.value, bx + 10, y + 20);
    });

    y += 60;

    const sectionTitle = (title: string) => {
      doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(8).text(title, M, y);
      y += 12;
      doc.moveTo(M, y).lineTo(M + CW, y).strokeColor('#d0d0d0').lineWidth(0.5).stroke();
      y += 8;
    };

    const field = (label: string, value: string) => {
      doc.fillColor(GRAY).font('Helvetica').fontSize(8.5).text(label, M, y, { width: 140, lineBreak: false });
      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8.5).text(value, M + 150, y, { width: CW - 150 });
      y = (doc.y as number) + 6;
    };

    if (permit.application) {
      sectionTitle('AANVRAGER');
      field('Naam', permit.application.applicant.name);
      field('Organisatie', permit.application.applicant.organisation);
      field('E-mail', permit.application.applicant.email);
      y += 6;

      sectionTitle('AANVRAAGGEGEVENS');
      field('Kenmerk', permit.application.referenceNumber);
      field('Titel', permit.application.title);
      field(
        'Type',
        permit.application.type === 'DATA_ACCESS_APPLICATION'
          ? 'Data-toegangsaanvraag (Art. 46 EHDS)'
          : 'Dataverzoek (Art. 69 EHDS)',
      );
      if (permit.application.legalBasis) field('Juridische grondslag', permit.application.legalBasis);
      if (permit.application.dataProcessingCountry) field('Verwerkingsland', permit.application.dataProcessingCountry);
      y += 6;
    }

    if (permit.revocationReason) {
      sectionTitle('REDEN INTREKKING');
      doc.fillColor('#7a1711').font('Helvetica').fontSize(8.5).text(permit.revocationReason, M, y, { width: CW });
      y += 20;
    }

    // Legal notice
    y += 4;
    doc.rect(M, y, CW, 48).fill('#e8f4fb');
    doc.rect(M, y, 4, 48).fill(LIGHT_BLUE);
    doc
      .fillColor(DARK_BLUE)
      .font('Helvetica')
      .fontSize(7.5)
      .text(
        'Deze vergunning is afgegeven op grond van de EHDS Verordening (EU) 2025/327 en de nationale implementatie ' +
          'daarvan. De vergunning is persoonsgebonden en niet overdraagbaar. Gebruik van de verleende gegevens is ' +
          'uitsluitend toegestaan voor het omschreven doel. TEHDAS2 D6.4 §9.',
        M + 14,
        y + 8,
        { width: CW - 24 },
      );

    // Footer
    const footerY = (doc.page.height as number) - 30;
    doc.moveTo(M, footerY).lineTo(W - M, footerY).strokeColor('#d0d0d0').lineWidth(0.5).stroke();
    doc
      .fillColor(GRAY)
      .font('Helvetica')
      .fontSize(7)
      .text(
        'HDAB-NL | Health Data Access Body Nederland | EHDS Verordening (EU) 2025/327',
        M,
        footerY + 6,
        { width: CW },
      );

    doc.end();
  });
}
