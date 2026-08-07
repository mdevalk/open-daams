import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';

/**
 * GET /api/spe-providers
 * List all registered SPE providers — no auth, so the operator tab's
 * "Provider" dropdown works for any role.
 */
export async function GET() {
  const speProviders = await prisma.speProvider.findMany({ orderBy: { name: 'asc' } });
  return NextResponse.json(speProviders);
}

/**
 * POST /api/spe-providers
 * Register a new SPE provider (Reference data masterdata, ADMIN-only).
 * body: { name, contactEmail?, contactPhone?, actingUserId }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const auth = await requireRole(body.actingUserId, ['ADMIN']);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 422 });
    }

    const speProvider = await prisma.speProvider.create({
      data: {
        name: String(body.name).trim(),
        contactEmail: body.contactEmail || null,
        contactPhone: body.contactPhone || null,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        entityType: 'SpeProvider',
        entityId: speProvider.id,
        action: `SPE provider created: ${speProvider.name}`,
      },
    });

    return NextResponse.json(speProvider, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'An SPE provider with this name already exists' }, { status: 409 });
    }
    console.error('Failed to create SPE provider', e);
    const message = e instanceof Error ? e.message : 'Failed to create SPE provider';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
