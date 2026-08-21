import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';

/** Builds the `data:` object for prisma.dataHolder.update() from a PATCH body. */
export function buildDataHolderUpdateData(body: Record<string, unknown>) {
  return {
    ...(body.name !== undefined ? { name: String(body.name).trim() } : {}),
    ...(body.isTrusted !== undefined ? { isTrusted: Boolean(body.isTrusted) } : {}),
    ...(body.address !== undefined ? { address: body.address || null } : {}),
    ...(body.businessId !== undefined ? { businessId: body.businessId || null } : {}),
    ...(body.vatNumber !== undefined ? { vatNumber: body.vatNumber || null } : {}),
    ...(body.invoiceType !== undefined ? { invoiceType: body.invoiceType || null } : {}),
    ...(body.invoiceReferenceNumber !== undefined
      ? { invoiceReferenceNumber: body.invoiceReferenceNumber || null }
      : {}),
    ...(body.eInvoiceAddress !== undefined ? { eInvoiceAddress: body.eInvoiceAddress || null } : {}),
    ...(body.operatorId !== undefined ? { operatorId: body.operatorId || null } : {}),
    ...(body.peppolCode !== undefined ? { peppolCode: body.peppolCode || null } : {}),
  };
}

/** Builds the human-readable audit-log `changes` list from a PATCH body. */
export function describeDataHolderChanges(body: Record<string, unknown>): string[] {
  const changes: string[] = [];
  if (body.name !== undefined) changes.push('name');
  if (body.contactEmail !== undefined) changes.push('contact email');
  if (body.contactPhone !== undefined) changes.push('contact phone');
  if (body.isTrusted !== undefined) changes.push(body.isTrusted ? 'marked as trusted' : 'un-marked as trusted');
  if (body.address !== undefined) changes.push('address');
  if (body.businessId !== undefined) changes.push('business ID');
  if (body.vatNumber !== undefined) changes.push('VAT number');
  if (body.invoiceType !== undefined) changes.push('invoice type');
  if (body.invoiceReferenceNumber !== undefined) changes.push('invoice reference number');
  if (body.eInvoiceAddress !== undefined) changes.push('e-invoice address');
  if (body.operatorId !== undefined) changes.push('operator ID');
  if (body.peppolCode !== undefined) changes.push('Peppol code');
  return changes;
}

/** Upserts the data holder's PRIMARY contact when contactEmail/contactPhone are present in the body. */
async function upsertPrimaryContact(id: string, body: Record<string, unknown>) {
  if (body.contactEmail === undefined && body.contactPhone === undefined) return;

  const existingContact = await prisma.contact.findFirst({ where: { dataHolderId: id, role: 'PRIMARY' } });
  const contactEmail = body.contactEmail as string | null | undefined;
  const contactPhone = body.contactPhone as string | null | undefined;
  const contactData = {
    ...(contactEmail !== undefined ? { email: contactEmail || null } : {}),
    ...(contactPhone !== undefined ? { phone: contactPhone || null } : {}),
  };
  if (existingContact) {
    await prisma.contact.update({ where: { id: existingContact.id }, data: contactData });
  } else {
    await prisma.contact.create({ data: { dataHolderId: id, role: 'PRIMARY', ...contactData } });
  }
}

/**
 * PATCH /api/data-holders/[id]
 * Update a data holder's masterdata (ADMIN-only).
 * body: { name?, contactEmail?, contactPhone?, isTrusted?, address?, businessId?, vatNumber?,
 *         invoiceType?, invoiceReferenceNumber?, eInvoiceAddress?, operatorId?, peppolCode?,
 *         actingUserId }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const auth = await requireRole(body.actingUserId, ['ADMIN']);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    await upsertPrimaryContact(id, body);

    const dataHolder = await prisma.dataHolder.update({
      where: { id },
      data: buildDataHolderUpdateData(body),
      include: { contacts: true },
    });

    const changes = describeDataHolderChanges(body);

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        entityType: 'DataHolder',
        entityId: dataHolder.id,
        action: `Data holder updated: ${dataHolder.name}`,
        comment: changes.length > 0 ? changes.join(', ') : null,
      },
    });

    return NextResponse.json(dataHolder);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'A data holder with this name already exists' }, { status: 409 });
    }
    console.error('Failed to update data holder', e);
    const message = e instanceof Error ? e.message : 'Failed to update data holder';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/data-holders/[id]
 * Remove a data holder (ADMIN-only). Blocked with 409 if still referenced by
 * any requested/granted dataset or extraction request.
 * body: { actingUserId }
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const auth = await requireRole(body.actingUserId, ['ADMIN']);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const dataHolder = await prisma.dataHolder.findUnique({
      where: { id },
      include: {
        _count: { select: { requestedDatasets: true, grantedDatasets: true, extractionRequests: true } },
      },
    });
    if (!dataHolder) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (Object.values(dataHolder._count).some((c) => c > 0)) {
      return NextResponse.json({ error: 'This data holder is still referenced and cannot be deleted' }, { status: 409 });
    }

    await prisma.dataHolder.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        entityType: 'DataHolder',
        entityId: id,
        action: `Data holder deleted: ${dataHolder.name}`,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Failed to delete data holder', e);
    const message = e instanceof Error ? e.message : 'Failed to delete data holder';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
