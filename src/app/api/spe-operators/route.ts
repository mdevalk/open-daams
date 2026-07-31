import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';

/**
 * GET /api/spe-operators
 * List all registered SPE operators (with their linked provider, if any) —
 * no auth, so the SpeProvisioningPanel dropdown works for any role.
 */
export async function GET() {
  const speOperators = await prisma.speOperator.findMany({
    include: { speProvider: { select: { name: true } } },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json(speOperators);
}

/**
 * POST /api/spe-operators
 * Register a new SPE operator (Reference data masterdata, ADMIN-only).
 * body: { name, contactEmail?, contactPhone?, speProviderId?, actingUserId }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const auth = await requireRole(body.actingUserId, ['ADMIN']);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 422 });
    }

    const speOperator = await prisma.speOperator.create({
      data: {
        name: String(body.name).trim(),
        contactEmail: body.contactEmail || null,
        contactPhone: body.contactPhone || null,
        speProviderId: body.speProviderId || null,
      },
    });

    return NextResponse.json(speOperator, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'An SPE operator with this name already exists' }, { status: 409 });
    }
    console.error('Failed to create SPE operator', e);
    const message = e instanceof Error ? e.message : 'Failed to create SPE operator';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
