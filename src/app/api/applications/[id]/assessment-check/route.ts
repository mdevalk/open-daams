import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';

export type AssessmentItem = {
  key: string;
  label: string;
  passed: boolean;
  comment?: string;
};

/**
 * POST /api/applications/[id]/assessment-check
 * Create or update the structured substantive assessment (TEHDAS2 D6.4
 * §7.3/7.4), distinct from the pre-screening completeness check.
 * body: { items: AssessmentItem[], result: 'PENDING'|'COMPLETE'|'INCOMPLETE', checkedById, remarks? }
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
      remarks: body.remarks || null,
      checkedById: auth.user.id,
      checkedAt: isDecision ? now : null,
    };

    // An assessment decision (Volledig/Onvolledig) is recorded immutably in
    // the application history with actor + check selection, since the
    // AssessmentCheck row itself is overwritten on each save.
    const passed = (body.items as AssessmentItem[]).filter((i) => i.passed).map((i) => i.label);
    const notPassed = (body.items as AssessmentItem[]).filter((i) => !i.passed).map((i) => i.label);
    const auditComment =
      `Inhoudelijke beoordeling (${passed.length}/${body.items.length} afgevinkt).` +
      (notPassed.length ? ` Niet afgevinkt: ${notPassed.join('; ')}.` : '') +
      (body.remarks ? ` Opmerking: ${body.remarks}` : '');

    const [check] = await prisma.$transaction([
      prisma.assessmentCheck.upsert({
        where: { applicationId: id },
        create: { applicationId: id, ...checkData },
        update: checkData,
      }),
      ...(isDecision
        ? [
            prisma.applicationLog.create({
              data: {
                applicationId: id,
                userId: auth.user.id,
                toStatus: application.status,
                action: result === 'COMPLETE' ? 'Inhoudelijke beoordeling: volledig' : 'Inhoudelijke beoordeling: onvolledig',
                comment: auditComment,
              },
            }),
          ]
        : []),
    ]);

    return NextResponse.json(check, { status: 201 });
  } catch (e) {
    console.error('Failed to save assessment check', e);
    const message = e instanceof Error ? e.message : 'Failed to save assessment check';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
