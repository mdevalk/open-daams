import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const users = await prisma.user.findMany({ orderBy: { name: 'asc' } });
    return NextResponse.json(users);
  } catch (e) {
    console.error('Failed to fetch users', e);
    const message = e instanceof Error ? e.message : 'Failed to fetch users';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
