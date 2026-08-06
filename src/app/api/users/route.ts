import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { findActingUser } from '@/lib/authz';

/**
 * GET /api/users?userId=
 * No legitimate caller needs more than id/name/role (the UI always fetches
 * user lists server-side via Prisma directly) — require a resolvable acting
 * user and never return email/dataUserId here.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await findActingUser(req.nextUrl.searchParams.get('userId'));
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
