import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getNcpApplicationList } from '@/lib/ncp-client';

/**
 * GET /api/import/ncp-queue
 *
 * TEHDAS2 D6.4 NCP query: returns the applications currently queued for
 * HDAB-NL by sending Member States' HDABs — a thin list (see ncp-client.ts;
 * full content requires a second, per-item detail fetch at import time via
 * /api/import/ncp-applications/[id]). Already-imported entries stay in the
 * list (not filtered out) but carry an `alreadyImported` reference, so the
 * UI can show them as done — with a link to the existing application —
 * across page reloads, not just within the browser session that did the
 * import. The actual duplicate-import prevention is enforced independently
 * in createApplicationFromHdeuPayload(); this is purely a display concern.
 */
export async function GET() {
  try {
    const entries = await getNcpApplicationList();

    const imported = await prisma.application.findMany({
      where: { hdeuApplicationId: { in: entries.map((e) => e.applicationId) } },
      select: { hdeuApplicationId: true, id: true, referenceNumber: true },
    });
    const importedById = new Map(imported.map((a) => [a.hdeuApplicationId, a]));

    return NextResponse.json({
      entries: entries.map((e) => {
        const existing = importedById.get(e.applicationId);
        return {
          ...e,
          alreadyImported: existing ? { id: existing.id, referenceNumber: existing.referenceNumber } : null,
        };
      }),
    });
  } catch (e) {
    console.error('Failed to fetch NCP applications list', e);
    const message = e instanceof Error ? e.message : 'Failed to fetch NCP applications list';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
