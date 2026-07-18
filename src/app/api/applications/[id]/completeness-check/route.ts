import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';

export type CompletenessItem = {
  key: string;
  label: string;
  passed: boolean;
  comment?: string;
};

/**
 * POST /api/applications/[id]/completeness-check
 * Create or update the structured completeness check (TEHDAS2 D6.3 Ch. 5,
 * Annex 7/8), distinct from the substantive assessment that follows it.
 * body: { items: CompletenessItem[], result: 'PENDING'|'COMPLETE'|'INCOMPLETE', checkedById }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const auth = await requireRole(body.checkedById, ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN']);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const application = await prisma.application.findUnique({ where: { id } });
    if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (!Array.isArray(body.items)) {
      return NextResponse.json({ error: 'items must be an array' }, { status: 422 });
    }

    const result = body.result ?? 'PENDING';
    const isDecision = result === 'COMPLETE' || result === 'INCOMPLETE';
    const now = new Date();

    const checkData = {
      items: body.items,
      result,
      checkedById: auth.user.id,
      checkedAt: isDecision ? now : null,
    };

    // A completeness decision (Volledig/Onvolledig) is the pre-screening decision:
    // record it immutably in the application history with actor + check selection,
    // since the CompletenessCheck row itself is overwritten on each save.
    const passed = (body.items as CompletenessItem[]).filter((i) => i.passed).map((i) => i.label);
    const notPassed = (body.items as CompletenessItem[]).filter((i) => !i.passed).map((i) => i.label);
    const auditComment =
      `Volledigheidscontrole (${passed.length}/${body.items.length} afgevinkt).` +
      (notPassed.length ? ` Niet afgevinkt: ${notPassed.join('; ')}.` : '');

    const [check] = await prisma.$transaction([
      prisma.completenessCheck.upsert({
        where: { applicationId: id },
        create: { applicationId: id, ...checkData },
        update: checkData,
      }),
      ...(isDecision
        ? [
            prisma.auditLog.create({
              data: {
                applicationId: id,
                userId: auth.user.id,
                toStatus: application.status,
                action: result === 'COMPLETE' ? 'Volledigheidscontrole: volledig' : 'Volledigheidscontrole: onvolledig',
                comment: auditComment,
              },
            }),
          ]
        : []),
    ]);

    return NextResponse.json(check, { status: 201 });
  } catch (e) {
    console.error('Failed to save completeness check', e);
    const message = e instanceof Error ? e.message : 'Failed to save completeness check';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
