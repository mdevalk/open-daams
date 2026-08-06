import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const [total, byStatus, overdue] = await Promise.all([
      prisma.application.count(),
      prisma.application.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.application.count({
        where: {
          decisionDeadline: { lt: new Date() },
          status: { notIn: ['DECISION_ISSUED', 'WITHDRAWN'] },
        },
      }),
    ]);

    return NextResponse.json({ total, byStatus, overdue });
  } catch (e) {
    console.error('Failed to fetch stats', e);
    const message = e instanceof Error ? e.message : 'Failed to fetch stats';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
