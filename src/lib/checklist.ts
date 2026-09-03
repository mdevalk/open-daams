import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';
import { actingUserId } from '@/auth';

export type ChecklistItem = {
  key: string;
  label: string;
  passed: boolean;
  comment?: string;
};

type ChecklistDelegate = typeof prisma.completenessCheck | typeof prisma.assessmentCheck;

// Shared POST handler for /applications/[id]/completeness-check and
// /applications/[id]/assessment-check — same shape (structured checklist +
// result + remarks), differing only in which model they upsert and the
// Dutch label used for the audit-log entry.
export async function handleChecklistUpdate(
  req: NextRequest,
  id: string,
  options: { delegate: ChecklistDelegate; auditLabel: string; kind: string },
) {
  try {
    const body = await req.json();

    const auth = await requireRole(await actingUserId(), ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN']);
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

    // A completeness/assessment decision (Volledig/Onvolledig) is recorded
    // immutably in the application history with actor + check selection,
    // since the check row itself is overwritten on each save.
    const items = body.items as ChecklistItem[];
    const passed = items.filter((i) => i.passed).map((i) => i.label);
    const notPassed = items.filter((i) => !i.passed).map((i) => i.label);
    const auditComment =
      `${options.auditLabel} (${passed.length}/${body.items.length} afgevinkt).` +
      (notPassed.length ? ` Niet afgevinkt: ${notPassed.join('; ')}.` : '') +
      (body.remarks ? ` Opmerking: ${body.remarks}` : '');

    // TypeScript can't call a method on a union of two generic Prisma
    // delegates (each upsert()'s generic constraint is incompatible with the
    // other's), even though CompletenessCheck and AssessmentCheck are
    // schema-identical (see prisma/schema.prisma) — cast is safe, upsert()'s
    // actual runtime behavior only depends on the shared shape.
    type UpsertFn = (args: {
      where: { applicationId: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => Promise<unknown>;
    const upsert = options.delegate.upsert as unknown as UpsertFn;

    const [check] = await prisma.$transaction([
      upsert({
        where: { applicationId: id },
        create: { applicationId: id, ...checkData },
        update: checkData,
      }) as ReturnType<typeof prisma.completenessCheck.upsert>,
      ...(isDecision
        ? [
            prisma.applicationLog.create({
              data: {
                applicationId: id,
                userId: auth.user.id,
                toStatus: application.status,
                action: `${options.auditLabel}: ${result === 'COMPLETE' ? 'volledig' : 'onvolledig'}`,
                comment: auditComment,
              },
            }),
          ]
        : []),
    ]);

    return NextResponse.json(check, { status: 201 });
  } catch (e) {
    console.error(`Failed to save ${options.kind}`, e);
    const message = e instanceof Error ? e.message : `Failed to save ${options.kind}`;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
