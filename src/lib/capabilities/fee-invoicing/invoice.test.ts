import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    invoice: { update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));
vi.mock('@/auth', () => ({ actingUserId: vi.fn() }));
vi.mock('@/lib/authz', () => ({ requireRole: vi.fn() }));

import { prisma } from '@/lib/db';
import { actingUserId } from '@/auth';
import { requireRole } from '@/lib/authz';
import {
  snapshotLineItems,
  sumLineItems,
  calculateDueDate,
  nextInvoiceNumber,
  groupByDataHolder,
  determineOutstandingInvoiceGroups,
  groupInvoicesByPermitOrApplication,
  buildInvoiceWhereClause,
  buildInvoiceStatusCounts,
  buildInvoiceStatusSums,
  resolveActiveTab,
  updateInvoiceStatus,
  type SourceLineItem,
} from '@/lib/capabilities/fee-invoicing/invoice';

const update = vi.mocked(prisma.invoice.update);
const auditCreate = vi.mocked(prisma.auditLog.create);
const mockActingUserId = vi.mocked(actingUserId);
const mockRequireRole = vi.mocked(requireRole);

beforeEach(() => {
  update.mockReset();
  auditCreate.mockReset();
  mockActingUserId.mockReset();
  mockRequireRole.mockReset();
});

describe('snapshotLineItems', () => {
  it('copies category/glCode/description/amount/currency/applicationId/dataHolderId, dropping identity fields', () => {
    const source = [
      { category: 'ADMINISTRATIVE', glCode: '4010', description: null, amount: 100, currency: 'EUR', applicationId: 'app1', dataHolderId: null },
      { category: 'DATA_HOLDER', glCode: '4030', description: null, amount: 250.5, currency: 'EUR', applicationId: 'app1', dataHolderId: 'dh1' },
    ] as unknown as SourceLineItem[];

    expect(snapshotLineItems(source)).toEqual([
      { category: 'ADMINISTRATIVE', glCode: '4010', description: null, amount: 100, currency: 'EUR', applicationId: 'app1', dataHolderId: null },
      { category: 'DATA_HOLDER', glCode: '4030', description: null, amount: 250.5, currency: 'EUR', applicationId: 'app1', dataHolderId: 'dh1' },
    ]);
  });

  it('returns an empty array for no source items', () => {
    expect(snapshotLineItems([])).toEqual([]);
  });
});

describe('groupByDataHolder', () => {
  it('groups DATA_HOLDER-category items by dataHolderId', () => {
    const items = [
      { category: 'DATA_HOLDER', dataHolderId: 'dh1', amount: 100 },
      { category: 'DATA_HOLDER', dataHolderId: 'dh2', amount: 50 },
      { category: 'DATA_HOLDER', dataHolderId: 'dh1', amount: 25 },
    ] as unknown as SourceLineItem[];

    const groups = groupByDataHolder(items);
    expect(groups.size).toBe(2);
    expect(groups.get('dh1')).toHaveLength(2);
    expect(groups.get('dh2')).toHaveLength(1);
  });

  it('drops non-DATA_HOLDER items and items with no dataHolderId', () => {
    const items = [
      { category: 'ADMINISTRATIVE', dataHolderId: null, amount: 100 },
      { category: 'DATA_HOLDER', dataHolderId: null, amount: 50 },
    ] as unknown as SourceLineItem[];

    expect(groupByDataHolder(items).size).toBe(0);
  });
});

describe('determineOutstandingInvoiceGroups', () => {
  const applicantItem = { category: 'ADMINISTRATIVE', dataHolderId: null } as unknown as SourceLineItem;
  const holder1Item = { category: 'DATA_HOLDER', dataHolderId: 'dh1' } as unknown as SourceLineItem;
  const holder2Item = { category: 'DATA_HOLDER', dataHolderId: 'dh2' } as unknown as SourceLineItem;
  const speItem = { category: 'SPE_SETUP', dataHolderId: null } as unknown as SourceLineItem;

  it('returns an applicant, one group per data holder, and an SPE group when nothing is billed yet', () => {
    const groups = determineOutstandingInvoiceGroups({
      lineItems: [applicantItem, holder1Item, holder2Item, speItem],
      existingInvoices: [],
      speOperatorId: 'op1',
    });

    expect(groups).toEqual([
      { recipientType: 'APPLICANT', items: [applicantItem, holder1Item, holder2Item, speItem] },
      { recipientType: 'DATA_HOLDER', dataHolderId: 'dh1', items: [holder1Item] },
      { recipientType: 'DATA_HOLDER', dataHolderId: 'dh2', items: [holder2Item] },
      { recipientType: 'SPE_OPERATOR', speOperatorId: 'op1', items: [speItem] },
    ]);
  });

  it('excludes the applicant group once an applicant invoice already exists', () => {
    const groups = determineOutstandingInvoiceGroups({
      lineItems: [applicantItem, holder1Item],
      existingInvoices: [{ recipientType: 'APPLICANT', dataHolderId: null }],
      speOperatorId: null,
    });

    expect(groups.map((g) => g.recipientType)).toEqual(['DATA_HOLDER']);
  });

  it('excludes only the data holder that already has an invoice', () => {
    const groups = determineOutstandingInvoiceGroups({
      lineItems: [holder1Item, holder2Item],
      existingInvoices: [{ recipientType: 'DATA_HOLDER', dataHolderId: 'dh1' }],
      speOperatorId: null,
    });

    expect(groups).toEqual([
      { recipientType: 'APPLICANT', items: [holder1Item, holder2Item] },
      { recipientType: 'DATA_HOLDER', dataHolderId: 'dh2', items: [holder2Item] },
    ]);
  });

  it('does not create an SPE group when no SPE operator is designated', () => {
    const groups = determineOutstandingInvoiceGroups({
      lineItems: [speItem],
      existingInvoices: [],
      speOperatorId: null,
    });

    expect(groups.some((g) => g.recipientType === 'SPE_OPERATOR')).toBe(false);
  });

  it('excludes the SPE group once an SPE invoice already exists', () => {
    const groups = determineOutstandingInvoiceGroups({
      lineItems: [speItem],
      existingInvoices: [{ recipientType: 'SPE_OPERATOR', dataHolderId: null }],
      speOperatorId: 'op1',
    });

    expect(groups.some((g) => g.recipientType === 'SPE_OPERATOR')).toBe(false);
  });

  it('returns nothing for an empty line-item list', () => {
    expect(
      determineOutstandingInvoiceGroups({ lineItems: [], existingInvoices: [], speOperatorId: 'op1' }),
    ).toEqual([]);
  });
});

describe('sumLineItems', () => {
  it('sums the amounts across line items', () => {
    expect(
      sumLineItems([{ amount: 100 }, { amount: 250.5 }] as unknown as SourceLineItem[]),
    ).toBe(350.5);
  });

  it('returns 0 for an empty list', () => {
    expect(sumLineItems([])).toBe(0);
  });
});

describe('calculateDueDate', () => {
  // setDate() operates in the local timezone, so fixtures use a local-time
  // Date constructor (not a UTC-midnight ISO string) to stay correct
  // regardless of the test runner's timezone.
  it('defaults to a 30-day payment term', () => {
    expect(calculateDueDate(new Date(2026, 0, 1))).toEqual(new Date(2026, 0, 31));
  });

  it('accepts a custom term', () => {
    expect(calculateDueDate(new Date(2026, 0, 1), 10)).toEqual(new Date(2026, 0, 11));
  });
});

describe('nextInvoiceNumber', () => {
  it('pads the sequence to 4 digits', () => {
    const year = new Date().getFullYear();
    expect(nextInvoiceNumber(7)).toBe(`INV-NL-${year}-0007`);
    expect(nextInvoiceNumber(1234)).toBe(`INV-NL-${year}-1234`);
  });

  it('accepts a custom prefix, for self-billing invoices', () => {
    const year = new Date().getFullYear();
    expect(nextInvoiceNumber(7, 'SBI-NL')).toBe(`SBI-NL-${year}-0007`);
  });
});

describe('groupInvoicesByPermitOrApplication', () => {
  function invoice(overrides: Record<string, unknown>) {
    return { permit: null, application: null, ...overrides };
  }

  it('groups by permitId when set', () => {
    const permit = { id: 'permit-1', application: { referenceNumber: 'HDAB-1', title: 'Study A', applicant: { name: 'A. de Vries' } } };
    const groups = groupInvoicesByPermitOrApplication([
      invoice({ id: 'inv-1', permit }),
      invoice({ id: 'inv-2', permit }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('permit-permit-1');
    expect(groups[0].invoices).toHaveLength(2);
    expect(groups[0].reference).toBe('A. de Vries — HDAB-1 — Study A');
  });

  it('falls back to applicationId for provisional (pre-permit) invoices', () => {
    const application = { id: 'app-1', referenceNumber: 'HDAB-2', title: 'Study B', applicant: { name: 'M. Jansen' } };
    const groups = groupInvoicesByPermitOrApplication([invoice({ id: 'inv-3', application })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('application-app-1');
    expect(groups[0].reference).toBe('M. Jansen — HDAB-2 — Study B');
  });

  it('preserves iteration order across distinct groups', () => {
    const permitA = { id: 'permit-A', application: { referenceNumber: 'A', title: 'A', applicant: null } };
    const permitB = { id: 'permit-B', application: { referenceNumber: 'B', title: 'B', applicant: null } };
    const groups = groupInvoicesByPermitOrApplication([
      invoice({ id: 'inv-1', permit: permitA }),
      invoice({ id: 'inv-2', permit: permitB }),
      invoice({ id: 'inv-3', permit: permitA }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['permit-permit-A', 'permit-permit-B']);
    expect(groups[0].invoices).toHaveLength(2);
  });
});

describe('buildInvoiceWhereClause', () => {
  it('returns an empty filter when nothing is set', () => {
    expect(buildInvoiceWhereClause({})).toEqual({});
  });

  it('filters by status', () => {
    expect(buildInvoiceWhereClause({ status: 'PAID' })).toEqual({ status: 'PAID' });
  });

  it('filters overdue invoices regardless of the status param', () => {
    const where = buildInvoiceWhereClause({ overdue: '1' });
    expect(where).toMatchObject({ status: 'ISSUED', dueAt: { lt: expect.any(Date) } });
  });

  it('filters by permitId', () => {
    expect(buildInvoiceWhereClause({ permitId: 'permit-1' })).toEqual({ permitId: 'permit-1' });
  });
});

describe('buildInvoiceStatusCounts', () => {
  it('maps groupBy count rows into a status -> count record', () => {
    expect(buildInvoiceStatusCounts([{ status: 'ISSUED', _count: 3 }, { status: 'PAID', _count: 5 }])).toEqual({
      ISSUED: 3,
      PAID: 5,
    });
  });

  it('returns an empty record for no rows', () => {
    expect(buildInvoiceStatusCounts([])).toEqual({});
  });
});

describe('buildInvoiceStatusSums', () => {
  it('maps groupBy sum rows into a status -> total record', () => {
    expect(
      buildInvoiceStatusSums([
        { status: 'ISSUED', _sum: { totalAmount: 1250.5 as never } },
        { status: 'PAID', _sum: { totalAmount: 300 as never } },
      ]),
    ).toEqual({ ISSUED: 1250.5, PAID: 300 });
  });

  it('treats a null sum as 0', () => {
    expect(buildInvoiceStatusSums([{ status: 'DRAFT', _sum: { totalAmount: null } }])).toEqual({ DRAFT: 0 });
  });
});

describe('resolveActiveTab', () => {
  it('returns "invoices" only when explicitly requested', () => {
    expect(resolveActiveTab('invoices')).toBe('invoices');
  });

  it('defaults to "estimates" for anything else', () => {
    expect(resolveActiveTab(undefined)).toBe('estimates');
    expect(resolveActiveTab('estimates')).toBe('estimates');
    expect(resolveActiveTab('bogus')).toBe('estimates');
  });
});

function makeInvoice(overrides: Partial<{ id: string; status: string; invoiceNumber: string }> = {}) {
  return { id: 'inv-1', status: 'ISSUED', invoiceNumber: 'INV-NL-2026-0001', ...overrides } as never;
}

describe('updateInvoiceStatus', () => {
  it('returns the authz error, unmodified, when mark_paid is not permitted', async () => {
    mockRequireRole.mockResolvedValue({ ok: false, status: 403, error: 'not allowed' });
    const res = await updateInvoiceStatus(makeInvoice(), 'mark_paid');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'not allowed' });
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects mark_paid on an invoice that is not ISSUED', async () => {
    mockRequireRole.mockResolvedValue({ ok: true, user: { id: 'u1', role: 'ADMIN', name: 'A', email: 'a@b.c' } });
    const res = await updateInvoiceStatus(makeInvoice({ status: 'CANCELLED' }), 'mark_paid');
    expect(res.status).toBe(422);
    expect(update).not.toHaveBeenCalled();
  });

  it('marks an ISSUED invoice paid and writes an audit log entry', async () => {
    mockRequireRole.mockResolvedValue({ ok: true, user: { id: 'u1', role: 'ADMIN', name: 'A', email: 'a@b.c' } });
    update.mockResolvedValue(makeInvoice({ status: 'PAID' }));
    const res = await updateInvoiceStatus(makeInvoice(), 'mark_paid');
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { status: 'PAID', paidAt: expect.any(Date) },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u1', entityType: 'Invoice', entityId: 'inv-1' }),
    });
  });

  it('rejects cancelling a PAID invoice', async () => {
    mockRequireRole.mockResolvedValue({ ok: true, user: { id: 'u1', role: 'ADMIN', name: 'A', email: 'a@b.c' } });
    const res = await updateInvoiceStatus(makeInvoice({ status: 'PAID' }), 'cancel');
    expect(res.status).toBe(422);
    expect(update).not.toHaveBeenCalled();
  });

  it('cancels a non-PAID invoice and writes an audit log entry', async () => {
    mockRequireRole.mockResolvedValue({ ok: true, user: { id: 'u1', role: 'DECISION_MAKER', name: 'A', email: 'a@b.c' } });
    update.mockResolvedValue(makeInvoice({ status: 'CANCELLED' }));
    const res = await updateInvoiceStatus(makeInvoice(), 'cancel');
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ where: { id: 'inv-1' }, data: { status: 'CANCELLED' } });
    expect(auditCreate).toHaveBeenCalled();
  });

  it('rejects an unknown action without touching authz or the database', async () => {
    const res = await updateInvoiceStatus(makeInvoice(), 'delete');
    expect(res.status).toBe(400);
    expect(mockRequireRole).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
