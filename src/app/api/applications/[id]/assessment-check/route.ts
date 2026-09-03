import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { handleChecklistUpdate } from '@/lib/checklist';

export type AssessmentItem = {
  key: string;
  label: string;
  passed: boolean;
  comment?: string;
};

/**
 * POST /api/applications/[id]/assessment-check
 * Create or update the structured substantive assessment (TEHDAS2 D6.4
 * §7.3/7.4), distinct from the pre-screening completeness check.
 * body: { items: AssessmentItem[], result: 'PENDING'|'COMPLETE'|'INCOMPLETE', remarks? }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleChecklistUpdate(req, id, {
    delegate: prisma.assessmentCheck,
    auditLabel: 'Inhoudelijke beoordeling',
    kind: 'assessment check',
  });
}
