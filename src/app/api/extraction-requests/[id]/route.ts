import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ExtractionStatus } from '@prisma/client';

const VALID_STATUSES: ExtractionStatus[] = ['REQUESTED', 'CONFIRMED', 'DELIVERED', 'DECLINED'];

/**
 * PATCH /api/extraction-requests/[id]
 * Progress an extraction request's status (confirmed by the data holder,
 * delivered, or declined).
 * body: { status, deliveryNotes? }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const request = await prisma.dataExtractionRequest.findUnique({ where: { id } });
    if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const status = body.status as ExtractionStatus;
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 422 });
    }

    const updated = await prisma.dataExtractionRequest.update({
      where: { id },
      data: {
        status,
        deliveryNotes: body.deliveryNotes ?? request.deliveryNotes,
        deliveredAt: status === 'DELIVERED' ? new Date() : request.deliveredAt,
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error('Failed to update extraction request', e);
    const message = e instanceof Error ? e.message : 'Failed to update extraction request';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
