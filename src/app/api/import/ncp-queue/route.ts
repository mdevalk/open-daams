import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getMockNcpQueue } from '@/lib/ncp-mock';

/**
 * GET /api/import/ncp-queue
 *
 * TEHDAS2 D6.4 NCP query: returns the applications currently queued for
 * HDAB-NL by sending Member States' HDABs, fetched from the HDAB-NL test
 * environment (falling back to a fixed sample queue if it's unreachable);
 * entries already imported are filtered out.
 */
export async function GET() {
  const queue = await getMockNcpQueue();

  const imported = await prisma.application.findMany({
    where: { hdeuApplicationId: { in: queue.map((e) => e.hdeuApplicationId) } },
    select: { hdeuApplicationId: true },
  });
  const importedIds = new Set(imported.map((a) => a.hdeuApplicationId));

  return NextResponse.json({
    entries: queue.filter((e) => !importedIds.has(e.hdeuApplicationId)),
  });
}
