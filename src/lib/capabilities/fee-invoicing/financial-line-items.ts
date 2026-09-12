import { FinancialLineCategory } from '@prisma/client';

// Single source of truth for cost-line labels and GL/account codes, shared by
// FeeEstimatePanel, PermitPanel, InvoicePanel/InvoiceActions, and
// generate-permit-pdf.ts. GL codes are placeholders — swap for real account
// codes here when available, nowhere else needs to change.
export const LINE_CATEGORY_META: Record<FinancialLineCategory, { label: string; glCode: string }> = {
  ADMINISTRATIVE: { label: 'Behandelkosten', glCode: '4010' },
  DATA_PREPARATION: { label: 'Gegevensvoorbereiding', glCode: '4020' },
  DATA_HOLDER: { label: 'Kosten gegevenshouder(s)', glCode: '4030' },
  SPE_SETUP: { label: 'SPE opstartkosten', glCode: '4040' },
  SPE_USAGE: { label: 'SPE gebruikskosten', glCode: '4041' },
  ADDITIONAL_SERVICES: { label: 'Aanvullende diensten', glCode: '4050' },
};

export const LINE_CATEGORY_ORDER: FinancialLineCategory[] = [
  'ADMINISTRATIVE',
  'DATA_PREPARATION',
  'DATA_HOLDER',
  'SPE_SETUP',
  'SPE_USAGE',
  'ADDITIONAL_SERVICES',
];
