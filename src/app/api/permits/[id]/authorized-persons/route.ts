import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * POST /api/permits/[id]/authorized-persons
 * Add a person entitled to process the data granted under this permit
 * within the secure processing environment (Annex 9 §6.8).
 * body: { name, affiliation, email }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const permit = await prisma.dataPermit.findUnique({ where: { id } });
    if (!permit) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (!body.name || !body.affiliation || !body.email) {
      return NextResponse.json({ error: 'name, affiliation and email are required' }, { status: 422 });
    }

    const person = await prisma.authorizedPerson.create({
      data: {
        permitId: id,
        name: body.name,
        affiliation: body.affiliation,
        email: body.email,
      },
    });

    return NextResponse.json(person, { status: 201 });
  } catch (e) {
    console.error('Failed to add authorized person', e);
    const message = e instanceof Error ? e.message : 'Failed to add authorized person';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
