import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';

/**
 * DELETE /api/permits/[id]/authorized-persons/[personId]
 * Remove a person from the list entitled to process data under this permit.
 * body: { actingUserId }
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; personId: string }> },
) {
  try {
    const { id, personId } = await params;
    const body = await req.json().catch(() => ({}));

    const auth = await requireRole(body.actingUserId, ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN']);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const person = await prisma.authorizedPerson.findUnique({ where: { id: personId } });
    if (!person || person.permitId !== id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await prisma.authorizedPerson.delete({ where: { id: personId } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Failed to remove authorized person', e);
    const message = e instanceof Error ? e.message : 'Failed to remove authorized person';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
