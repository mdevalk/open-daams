import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const STAFF_ROLES = ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN', 'DATA_HOLDER'];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();

    const author = await prisma.user.findUnique({ where: { id: body.authorId } });
    if (!author) {
      return NextResponse.json({ error: 'A valid author id is required' }, { status: 401 });
    }

    const note = await prisma.note.create({
      data: {
        applicationId: id,
        authorId: author.id,
        content: body.content,
        isInternal: STAFF_ROLES.includes(author.role) ? (body.isInternal ?? false) : false,
      },
      include: { author: { select: { id: true, name: true, role: true } } },
    });

    return NextResponse.json(note, { status: 201 });
  } catch (e) {
    console.error(`Failed to add note to application ${id}`, e);
    const message = e instanceof Error ? e.message : 'Failed to add note';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
