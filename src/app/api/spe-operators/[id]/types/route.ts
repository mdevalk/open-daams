import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';

/**
 * POST /api/spe-operators/[id]/types
 * Register a new SPE type (tier/product) offered by this operator, e.g.
 * "Standard" with its own setup and monthly fee (Reference data masterdata,
 * ADMIN-only). Selected per permit at issuance to pre-fill the SPE fee fields.
 * body: { name, setupFee, monthlyFee, actingUserId }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const auth = await requireRole(body.actingUserId, ['ADMIN']);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 422 });
    }
    const setupFee = Number(body.setupFee);
    const monthlyFee = Number(body.monthlyFee);
    if (!Number.isFinite(setupFee) || !Number.isFinite(monthlyFee)) {
      return NextResponse.json({ error: 'setupFee and monthlyFee must be numbers' }, { status: 422 });
    }

    const speOperator = await prisma.speOperator.findUnique({ where: { id }, select: { name: true } });
    if (!speOperator) return NextResponse.json({ error: 'SPE operator not found' }, { status: 404 });

    const type = await prisma.speType.create({
      data: { speOperatorId: id, name: String(body.name).trim(), setupFee, monthlyFee },
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        entityType: 'SpeType',
        entityId: type.id,
        action: `SPE type created: ${type.name} (${speOperator.name})`,
      },
    });

    return NextResponse.json(type, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'This operator already has a type with that name' }, { status: 409 });
    }
    console.error('Failed to create SPE type', e);
    const message = e instanceof Error ? e.message : 'Failed to create SPE type';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
