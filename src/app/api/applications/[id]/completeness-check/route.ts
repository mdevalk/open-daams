import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { handleChecklistUpdate } from '@/lib/checklist';

export type CompletenessItem = {
  key: string;
  label: string;
  passed: boolean;
  comment?: string;
};

/**
 * POST /api/applications/[id]/completeness-check
 * Create or update the structured completeness check (TEHDAS2 D6.3 Ch. 5,
 * Annex 7/8), distinct from the substantive assessment that follows it.
 * body: { items: CompletenessItem[], result: 'PENDING'|'COMPLETE'|'INCOMPLETE', remarks? }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleChecklistUpdate(req, id, {
    delegate: prisma.completenessCheck,
    auditLabel: 'Volledigheidscontrole',
    kind: 'completeness check',
  });
}
