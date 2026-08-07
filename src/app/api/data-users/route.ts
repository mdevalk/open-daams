import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';

/**
 * GET /api/data-users
 * List all registered data users (organisations) — no auth, matches the
 * /api/users precedent.
 */
export async function GET() {
  const dataUsers = await prisma.dataUser.findMany({ orderBy: { name: 'asc' } });
  return NextResponse.json(dataUsers);
}

/**
 * POST /api/data-users
 * Register a new data user organisation (Reference data masterdata, ADMIN-only).
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

    const dataUser = await prisma.dataUser.create({
      data: {
        name: String(body.name).trim(),
        contactEmail: body.contactEmail || null,
        contactPhone: body.contactPhone || null,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        entityType: 'DataUser',
        entityId: dataUser.id,
        action: `Data user created: ${dataUser.name}`,
      },
    });

    return NextResponse.json(dataUser, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'A data user with this name already exists' }, { status: 409 });
    }
    console.error('Failed to create data user', e);
    const message = e instanceof Error ? e.message : 'Failed to create data user';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
