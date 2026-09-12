import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';

export type ChecklistItem = {
  key: string;
  label: string;
  passed: boolean;
  comment?: string;
};

type ChecklistDelegate = typeof prisma.completenessCheck | typeof prisma.assessmentCheck;

export type ChecklistUpdateResult =
  | { ok: true; status: 201; data: unknown }
  | { ok: false; status: 401 | 403 | 404 | 422 | 500; error: string };

// Shared by completePreScreeningCheck and completeSubstantiveAssessment — same shape (structured
// checklist + result + remarks), differing only in which model they upsert and the Dutch label
// used for the audit-log entry.
async function updateChecklist(
  actingUserId: unknown,
  applicationId: string,
  body: unknown,
  options: { delegate: ChecklistDelegate; auditLabel: string; kind: string },
): Promise<ChecklistUpdateResult> {
  try {
    const auth = await requireRole(actingUserId, ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN']);
    if (!auth.ok) return { ok: false, status: auth.status, error: auth.error };

    const application = await prisma.application.findUnique({ where: { id: applicationId } });
    if (!application) return { ok: false, status: 404, error: 'Not found' };

    const parsedBody = body as { items?: unknown; result?: string; remarks?: string };
    if (!Array.isArray(parsedBody.items)) {
      return { ok: false, status: 422, error: 'items must be an array' };
    }

    const result = parsedBody.result ?? 'PENDING';
    const isDecision = result === 'COMPLETE' || result === 'INCOMPLETE';
    const now = new Date();

    const checkData = {
      items: parsedBody.items,
      result,
      remarks: parsedBody.remarks || null,
      checkedById: auth.user.id,
      checkedAt: isDecision ? now : null,
    };

    // A completeness/assessment decision (Volledig/Onvolledig) is recorded immutably in the
    // application history with actor + check selection, since the check row itself is
    // overwritten on each save.
    const items = parsedBody.items as ChecklistItem[];
    const passed = items.filter((i) => i.passed).map((i) => i.label);
    const notPassed = items.filter((i) => !i.passed).map((i) => i.label);
    const auditComment =
      `${options.auditLabel} (${passed.length}/${items.length} afgevinkt).` +
      (notPassed.length ? ` Niet afgevinkt: ${notPassed.join('; ')}.` : '') +
      (parsedBody.remarks ? ` Opmerking: ${parsedBody.remarks}` : '');

    // TypeScript can't call a method on a union of two generic Prisma delegates (each upsert()'s
    // generic constraint is incompatible with the other's), even though CompletenessCheck and
    // AssessmentCheck are schema-identical (see prisma/schema.prisma) — cast is safe, upsert()'s
    // actual runtime behavior only depends on the shared shape.
    type UpsertFn = (args: {
      where: { applicationId: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => Promise<unknown>;
    const upsert = options.delegate.upsert as unknown as UpsertFn;

    const [check] = await prisma.$transaction([
      upsert({
        where: { applicationId },
        create: { applicationId, ...checkData },
        update: checkData,
      }) as ReturnType<typeof prisma.completenessCheck.upsert>,
      ...(isDecision
        ? [
            prisma.applicationLog.create({
              data: {
                applicationId,
                userId: auth.user.id,
                toStatus: application.status,
                action: `${options.auditLabel}: ${result === 'COMPLETE' ? 'volledig' : 'onvolledig'}`,
                comment: auditComment,
              },
            }),
          ]
        : []),
    ]);

    return { ok: true, status: 201, data: check };
  } catch (e) {
    console.error(`Failed to save ${options.kind}`, e);
    const message = e instanceof Error ? e.message : `Failed to save ${options.kind}`;
    return { ok: false, status: 500, error: message };
  }
}

export const completePreScreeningCheck = (actingUserId: unknown, applicationId: string, body: unknown) =>
  updateChecklist(actingUserId, applicationId, body, {
    delegate: prisma.completenessCheck,
    auditLabel: 'Volledigheidscontrole',
    kind: 'completeness check',
  });

export const completeSubstantiveAssessment = (actingUserId: unknown, applicationId: string, body: unknown) =>
  updateChecklist(actingUserId, applicationId, body, {
    delegate: prisma.assessmentCheck,
    auditLabel: 'Inhoudelijke beoordeling',
    kind: 'assessment check',
  });
