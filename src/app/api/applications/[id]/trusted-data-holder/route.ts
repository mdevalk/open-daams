import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';

const MANAGE_ROLES = ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN'] as const;

/**
 * PATCH /api/applications/[id]/trusted-data-holder
 * Select (or clear) the trusted data holder for an application (D6.4 §12 / Art. 72).
 * body: { trustedDataHolderId: string | null, actingUserId }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();

    const auth = await requireRole(body.actingUserId, [...MANAGE_ROLES]);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const application = await prisma.application.update({
      where: { id },
      data: { trustedDataHolderId: body.trustedDataHolderId || null },
    });

    return NextResponse.json(application);
  } catch (e) {
    console.error(`Failed to update trusted data holder for application ${id}`, e);
    const message = e instanceof Error ? e.message : 'Failed to update trusted data holder';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
