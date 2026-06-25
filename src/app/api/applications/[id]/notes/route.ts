import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const note = await prisma.note.create({
    data: {
      applicationId: id,
      authorId: body.authorId,
      content: body.content,
      isInternal: body.isInternal ?? false,
    },
    include: { author: { select: { id: true, name: true, role: true } } },
  });

  return NextResponse.json(note, { status: 201 });
}
