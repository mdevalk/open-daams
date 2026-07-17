import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';
import { REQUEST_ROLES, requestableTypes } from '@/lib/permit-change';
import { PermitChangeType } from '@prisma/client';

/**
 * POST /api/permits/[id]/change-requests
 * Document a change requested by the data user against a permit (D6.4 §9.3/§9.4).
 * body: { type, justification, requestedById }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const auth = await requireRole(body.requestedById, [...REQUEST_ROLES]);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const permit = await prisma.dataPermit.findUnique({ where: { id } });
    if (!permit) return NextResponse.json({ error: 'Permit not found' }, { status: 404 });

    const type = body.type as PermitChangeType;
    if (!requestableTypes(permit.status).includes(type)) {
      return NextResponse.json(
        { error: `A ${type} request is not allowed for a permit in status ${permit.status}` },
        { status: 422 },
      );
    }
    if (!body.justification || !String(body.justification).trim()) {
      return NextResponse.json({ error: 'A justification is required' }, { status: 400 });
    }

    const created = await prisma.permitChangeRequest.create({
      data: {
        permitId: id,
        type,
        justification: String(body.justification),
        requestedById: auth.user.id,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create change request';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
