import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { findActingUser } from '@/lib/authz';
import { actingUserId } from '@/auth';

/**
 * GET /api/users
 * No legitimate caller needs more than id/name/role (the UI always fetches
 * user lists server-side via Prisma directly) — require a resolvable acting
 * user and never return email/dataUserId here.
 */
export async function GET() {
  try {
    const auth = await findActingUser(await actingUserId());
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const users = await prisma.user.findMany({
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(users);
  } catch (e) {
    console.error('Failed to fetch users', e);
    const message = e instanceof Error ? e.message : 'Failed to fetch users';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
