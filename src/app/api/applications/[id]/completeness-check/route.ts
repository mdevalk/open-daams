import { NextRequest, NextResponse } from 'next/server';
import { completePreScreeningCheck } from '@/lib/capabilities/application-lifecycle/checklist-checks';
import { actingUserId } from '@/auth';

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
  const body = await req.json();
  const result = await completePreScreeningCheck(await actingUserId(), id, body);
  return result.ok
    ? NextResponse.json(result.data, { status: result.status })
    : NextResponse.json({ error: result.error }, { status: result.status });
}
