import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generatePermitPdf } from '@/lib/permit-pdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const permit = await prisma.dataPermit.findUnique({
    where: { id },
    include: {
      application: {
        select: {
          referenceNumber: true,
          title: true,
          type: true,
          legalBasis: true,
          dataProcessingCountry: true,
          applicant: { select: { name: true, organisation: true, email: true } },
        },
      },
    },
  });

  if (!permit) {
    return new NextResponse('Not found', { status: 404 });
  }

  const pdfBytes = await generatePermitPdf(permit);
  const filename = `vergunning-${permit.permitNumber.replace(/\//g, '-')}.pdf`;

  return new NextResponse(pdfBytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
