import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const DARK_BLUE = '#154273';
const LIGHT_BLUE = '#01689b';
const GRAY = '#595959';
const LIGHT_GRAY = '#f5f5f5';
const GREEN = '#1a5c2e';
const GREEN_BG = '#e6f5ea';

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#000000',
    paddingTop: 0,
    paddingBottom: 40,
    paddingHorizontal: 0,
  },
  header: {
    backgroundColor: DARK_BLUE,
    paddingHorizontal: 40,
    paddingVertical: 20,
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  headerSub: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 3,
  },
  body: {
    paddingHorizontal: 40,
  },
  permitNumberBox: {
    backgroundColor: LIGHT_GRAY,
    borderLeft: `4px solid ${DARK_BLUE}`,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
  },
  permitNumberLabel: {
    fontSize: 8,
    color: GRAY,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  permitNumber: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: DARK_BLUE,
    letterSpacing: 1,
  },
  statusBadge: {
    backgroundColor: GREEN_BG,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  statusText: {
    color: GREEN,
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: DARK_BLUE,
    borderBottom: `1px solid #d0d0d0`,
    paddingBottom: 4,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  label: {
    width: 150,
    color: GRAY,
    fontSize: 9,
  },
  value: {
    flex: 1,
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
  },
  validityRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 18,
  },
  validityBox: {
    flex: 1,
    backgroundColor: LIGHT_GRAY,
    borderRadius: 4,
    padding: 10,
  },
  validityLabel: {
    fontSize: 8,
    color: GRAY,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  validityValue: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: DARK_BLUE,
  },
  notice: {
    backgroundColor: '#e8f4fb',
    borderLeft: `4px solid ${LIGHT_BLUE}`,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 18,
    fontSize: 8,
    color: DARK_BLUE,
    lineHeight: 1.5,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    borderTop: `1px solid #d0d0d0`,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 7,
    color: GRAY,
  },
});

function fmt(d: Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export type PermitPdfData = {
  permitNumber: string;
  status: string;
  issuedAt: Date | null;
  validFrom: Date | null;
  validUntil: Date | null;
  revocationReason?: string | null;
  previousPermitId?: string | null;
  application: {
    referenceNumber: string;
    title: string;
    type: string;
    legalBasis?: string | null;
    purposeCategory?: string | null;
    dataProcessingCountry?: string | null;
    applicant: {
      name: string;
      organisation: string;
      email: string;
    };
  } | null;
};

const STATUS_NL: Record<string, string> = {
  GRANTED: 'Verleend',
  AMENDED: 'Gewijzigd',
  RENEWED: 'Verlengd',
  REVOKED: 'Ingetrokken',
  EXPIRED: 'Verlopen',
};

export function PermitPdfDocument({ permit }: { permit: PermitPdfData }) {
  const app = permit.application;

  return (
    <Document
      title={`Vergunning ${permit.permitNumber}`}
      author="HDAB-NL"
      subject="EHDS Dataverwerkingsvergunning"
    >
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>HDAB-NL | DAAMS</Text>
          <Text style={s.headerSub}>Health Data Access Body Nederland — EHDS Dataverwerkingsvergunning</Text>
        </View>

        <View style={s.body}>
          {/* Permit number + status */}
          <View style={s.permitNumberBox}>
            <Text style={s.permitNumberLabel}>Vergunningsnummer</Text>
            <Text style={s.permitNumber}>{permit.permitNumber}</Text>
            <View style={s.statusBadge}>
              <Text style={s.statusText}>{STATUS_NL[permit.status] ?? permit.status}</Text>
            </View>
          </View>

          {/* Validity */}
          <View style={s.validityRow}>
            <View style={s.validityBox}>
              <Text style={s.validityLabel}>Geldig vanaf</Text>
              <Text style={s.validityValue}>{fmt(permit.validFrom)}</Text>
            </View>
            <View style={s.validityBox}>
              <Text style={s.validityLabel}>Geldig tot en met</Text>
              <Text style={s.validityValue}>{fmt(permit.validUntil)}</Text>
            </View>
            <View style={s.validityBox}>
              <Text style={s.validityLabel}>Uitgegeven op</Text>
              <Text style={s.validityValue}>{fmt(permit.issuedAt)}</Text>
            </View>
          </View>

          {/* Applicant */}
          {app && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Aanvrager</Text>
              <View style={s.row}>
                <Text style={s.label}>Naam</Text>
                <Text style={s.value}>{app.applicant.name}</Text>
              </View>
              <View style={s.row}>
                <Text style={s.label}>Organisatie</Text>
                <Text style={s.value}>{app.applicant.organisation}</Text>
              </View>
              <View style={s.row}>
                <Text style={s.label}>E-mail</Text>
                <Text style={s.value}>{app.applicant.email}</Text>
              </View>
            </View>
          )}

          {/* Application details */}
          {app && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Aanvraaggegevens</Text>
              <View style={s.row}>
                <Text style={s.label}>Kenmerk</Text>
                <Text style={s.value}>{app.referenceNumber}</Text>
              </View>
              <View style={s.row}>
                <Text style={s.label}>Titel</Text>
                <Text style={s.value}>{app.title}</Text>
              </View>
              <View style={s.row}>
                <Text style={s.label}>Type</Text>
                <Text style={s.value}>
                  {app.type === 'DATA_ACCESS_APPLICATION'
                    ? 'Data-toegangsaanvraag (Art. 46 EHDS)'
                    : 'Dataverzoek (Art. 69 EHDS)'}
                </Text>
              </View>
              {app.legalBasis && (
                <View style={s.row}>
                  <Text style={s.label}>Juridische grondslag</Text>
                  <Text style={s.value}>{app.legalBasis}</Text>
                </View>
              )}
              {app.dataProcessingCountry && (
                <View style={s.row}>
                  <Text style={s.label}>Verwerkingsland</Text>
                  <Text style={s.value}>{app.dataProcessingCountry}</Text>
                </View>
              )}
            </View>
          )}

          {/* Revocation reason */}
          {permit.revocationReason && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Reden intrekking</Text>
              <Text style={{ fontSize: 9, color: '#7a1711' }}>{permit.revocationReason}</Text>
            </View>
          )}

          {/* Legal notice */}
          <View style={s.notice}>
            <Text>
              Deze vergunning is afgegeven op grond van de EHDS Verordening (EU) 2025/327 en de nationale
              implementatie daarvan. De vergunning is persoonsgebonden en niet overdraagbaar. Gebruik van
              de verleende gegevens is uitsluitend toegestaan voor het omschreven doel. TEHDAS2 D6.4 §9.
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>HDAB-NL | Health Data Access Body Nederland | EHDS Verordening (EU) 2025/327</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} van ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
