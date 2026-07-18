import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { PrintTrigger } from '@/components/PrintTrigger';
import { PERMIT_STATUS_LABELS, formatPermitId } from '@/lib/permit';
import { APP_NAME } from '@/lib/branding';

export const dynamic = 'force-dynamic';

function fmt(d: Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default async function PermitPrintPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id } = await params;

  const permit = await prisma.dataPermit.findUnique({
    where: { id },
    include: {
      application: {
        select: {
          referenceNumber: true,
          title: true,
          type: true,
          legalBasis: true,
          dataProcessingCountry: true,
          purposeCategory: true,
          applicant: { select: { name: true, organisation: true, email: true } },
        },
      },
    },
  });

  if (!permit) notFound();

  const app = permit.application;

  return (
    <html lang="nl">
      <head>
        <meta charSet="utf-8" />
        <title>Vergunning {formatPermitId(permit.permitNumber, permit.version)} — {APP_NAME}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #000; background: #fff; }

          .no-print { margin-bottom: 16px; padding: 12px 16px; background: #e8f4fb; border-left: 4px solid #01689b; display: flex; align-items: center; justify-content: space-between; }
          .no-print button { background: #154273; color: #fff; border: none; padding: 8px 20px; font-size: 11pt; cursor: pointer; border-radius: 4px; }

          .page { max-width: 21cm; margin: 0 auto; padding: 0 1cm; }

          .header { background: #154273; color: #fff; padding: 20px 24px; margin-bottom: 24px; }
          .header h1 { font-size: 18pt; font-weight: bold; letter-spacing: 0.5px; }
          .header p { font-size: 8.5pt; color: rgba(255,255,255,0.75); margin-top: 4px; }

          .permit-box { background: #f0f0f0; border-left: 5px solid #154273; padding: 12px 16px; margin-bottom: 20px; }
          .permit-box .label { font-size: 7.5pt; color: #595959; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4px; }
          .permit-box .number { font-size: 16pt; font-weight: bold; color: #154273; letter-spacing: 1px; }
          .status-badge { display: inline-block; background: #e6f5ea; color: #1a5c2e; font-size: 8pt; font-weight: bold; padding: 2px 10px; border-radius: 4px; margin-top: 8px; }
          .status-badge.revoked { background: #fce8e6; color: #7a1711; }

          .validity-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 22px; }
          .validity-box { background: #f0f0f0; padding: 10px 12px; border-radius: 4px; }
          .validity-box .label { font-size: 7pt; color: #595959; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 4px; }
          .validity-box .value { font-size: 12pt; font-weight: bold; color: #154273; }

          .section { margin-bottom: 18px; }
          .section-title { font-size: 8pt; font-weight: bold; color: #154273; text-transform: uppercase; letter-spacing: 0.6px; border-bottom: 1px solid #d0d0d0; padding-bottom: 4px; margin-bottom: 10px; }
          .field { display: grid; grid-template-columns: 150px 1fr; gap: 8px; margin-bottom: 6px; font-size: 9.5pt; }
          .field .lbl { color: #595959; }
          .field .val { font-weight: bold; }

          .notice { background: #e8f4fb; border-left: 4px solid #01689b; padding: 10px 14px; font-size: 7.5pt; color: #154273; line-height: 1.6; margin-bottom: 20px; }

          .footer-bar { border-top: 1px solid #d0d0d0; padding-top: 8px; margin-top: 16px; font-size: 7pt; color: #595959; }

          @media print {
            .no-print { display: none !important; }
            body { font-size: 10pt; }
            .page { padding: 0; }
            .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .permit-box { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .validity-box { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .status-badge { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .notice { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        `}</style>
      </head>
      <body>
        <PrintTrigger />
        <div className="no-print">
          <span style={{ fontSize: '11pt', color: '#154273', fontWeight: 'bold' }}>
            Kies ‘Opslaan als PDF’ in het printvenster om te downloaden.
          </span>
          <button onClick={() => window.print()}>Afdrukken / PDF opslaan</button>
        </div>

        <div className="page">
          <div className="header">
            <h1>{APP_NAME}</h1>
            <p>Health Data Access Body Nederland (HDAB-NL) — EHDS Dataverwerkingsvergunning</p>
          </div>

          <div className="permit-box">
            <div className="label">Vergunningsnummer</div>
            <div className="number">{formatPermitId(permit.permitNumber, permit.version)}</div>
            <div className={`status-badge${permit.status === 'REVOKED' ? ' revoked' : ''}`}>
              {PERMIT_STATUS_LABELS[permit.status]}
            </div>
          </div>

          <div className="validity-row">
            <div className="validity-box">
              <div className="label">Geldig vanaf</div>
              <div className="value">{fmt(permit.validFrom)}</div>
            </div>
            <div className="validity-box">
              <div className="label">Geldig tot en met</div>
              <div className="value">{fmt(permit.validUntil)}</div>
            </div>
            <div className="validity-box">
              <div className="label">Uitgegeven op</div>
              <div className="value">{fmt(permit.issuedAt)}</div>
            </div>
          </div>

          {app && (
            <>
              <div className="section">
                <div className="section-title">Aanvrager</div>
                <div className="field"><span className="lbl">Naam</span><span className="val">{app.applicant.name}</span></div>
                <div className="field"><span className="lbl">Organisatie</span><span className="val">{app.applicant.organisation}</span></div>
                <div className="field"><span className="lbl">E-mail</span><span className="val">{app.applicant.email}</span></div>
              </div>

              <div className="section">
                <div className="section-title">Aanvraaggegevens</div>
                <div className="field"><span className="lbl">Kenmerk</span><span className="val">{app.referenceNumber}</span></div>
                <div className="field"><span className="lbl">Titel</span><span className="val">{app.title}</span></div>
                <div className="field">
                  <span className="lbl">Type</span>
                  <span className="val">{app.type === 'DATA_ACCESS_APPLICATION' ? 'Data-toegangsaanvraag (Art. 67 EHDS)' : 'Dataverzoek (Art. 69 EHDS)'}</span>
                </div>
                {app.legalBasis && <div className="field"><span className="lbl">Juridische grondslag</span><span className="val">{app.legalBasis}</span></div>}
                {app.dataProcessingCountry && <div className="field"><span className="lbl">Verwerkingsland</span><span className="val">{app.dataProcessingCountry}</span></div>}
              </div>
            </>
          )}

          {permit.revocationReason && (
            <div className="section">
              <div className="section-title">Reden intrekking</div>
              <p style={{ fontSize: '9.5pt', color: '#7a1711' }}>{permit.revocationReason}</p>
            </div>
          )}

          <div className="notice">
            Deze vergunning is afgegeven op grond van de EHDS Verordening (EU) 2025/327 en de nationale implementatie
            daarvan. De vergunning is persoonsgebonden en niet overdraagbaar. Gebruik van de verleende gegevens is
            uitsluitend toegestaan voor het omschreven doel. TEHDAS2 D6.4 §9.
          </div>

          <div className="footer-bar">
            {APP_NAME} | Health Data Access Body Nederland (HDAB-NL) | EHDS Verordening (EU) 2025/327
          </div>
        </div>
      </body>
    </html>
  );
}
