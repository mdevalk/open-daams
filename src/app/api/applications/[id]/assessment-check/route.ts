import { NextRequest, NextResponse } from 'next/server';
import { completeSubstantiveAssessment } from '@/lib/capabilities/application-lifecycle/checklist-checks';
import { actingUserId } from '@/auth';

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
  const body = await req.json();
  const result = await completeSubstantiveAssessment(await actingUserId(), id, body);
  return result.ok
    ? NextResponse.json(result.data, { status: result.status })
    : NextResponse.json({ error: result.error }, { status: result.status });
}
