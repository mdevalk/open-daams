import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * POST /api/applications/[id]/extraction-requests
 * Register a request to a health data holder to extract the data covered by
 * an issued permit (EHDS Art. 60, 68(7), TEHDAS2 D6.3 §7.1).
 * body: { dataHolderName, datasetDescription, requestedById }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const application = await prisma.application.findUnique({ where: { id } });
    if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (!body.dataHolderName || !body.datasetDescription || !body.requestedById) {
      return NextResponse.json(
        { error: 'dataHolderName, datasetDescription and requestedById are required' },
        { status: 422 },
      );
    }

    const request = await prisma.dataExtractionRequest.create({
      data: {
        applicationId: id,
        dataHolderName: body.dataHolderName,
        datasetDescription: body.datasetDescription,
        requestedById: body.requestedById,
      },
    });

    return NextResponse.json(request, { status: 201 });
  } catch (e) {
    console.error('Failed to register extraction request', e);
    const message = e instanceof Error ? e.message : 'Failed to register extraction request';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
