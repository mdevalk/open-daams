import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/authz';

/**
 * POST /api/appeals/[id]/attachments
 * Attach correspondence/documentation to an appeal (R10.0.5) — the actual
 * bezwaar/beroep process runs through national administrative/judicial
 * channels outside DAAMS, so this is where the resulting paperwork (the
 * appellant's written objection, a court ruling, etc.) gets saved and
 * linked to the application record.
 * body: { filename, mimeType, content (base64), actingUserId }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const auth = await requireRole(body.actingUserId, ['CASE_HANDLER', 'DECISION_MAKER', 'ADMIN']);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const appeal = await prisma.appeal.findUnique({ where: { id } });
    if (!appeal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (!body.filename || !body.content) {
      return NextResponse.json({ error: 'filename and content are required' }, { status: 422 });
    }

    let content: Buffer;
    try {
      content = Buffer.from(body.content, 'base64');
    } catch {
      return NextResponse.json({ error: 'content must be base64-encoded' }, { status: 422 });
    }

    const attachment = await prisma.attachment.create({
      data: {
        applicationId: appeal.applicationId,
        appealId: id,
        field: 'appeal-correspondence',
        filename: body.filename,
        mimeType: body.mimeType || null,
        sizeBytes: content.byteLength,
        content,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.user.id,
        entityType: 'Appeal',
        entityId: id,
        action: `Appeal attachment added: ${attachment.filename}`,
        comment: null,
      },
    });

    return NextResponse.json({ id: attachment.id, filename: attachment.filename, mimeType: attachment.mimeType }, { status: 201 });
  } catch (e) {
    console.error('Failed to attach file to appeal', e);
    const message = e instanceof Error ? e.message : 'Failed to attach file to appeal';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
