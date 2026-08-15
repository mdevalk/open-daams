import { NcpCallDirection, NcpCallOutcome } from '@prisma/client';
import { prisma } from '@/lib/db';

/**
 * Persists one row per real call to the HealthData@EU NCP (see
 * ncp-client.ts, which stays Prisma-free — this is the caller's
 * responsibility, same as signPermit not persisting its own result).
 * Never throws: a logging failure must not mask the original call's
 * outcome to whoever's awaiting the response.
 */
export async function logNcpCall(params: {
  direction: NcpCallDirection;
  operation: string;
  outcome: NcpCallOutcome;
  errorMessage?: string | null;
  applicationId?: string | null;
  initiatedById?: string | null;
}): Promise<void> {
  try {
    await prisma.ncpIntegrationLog.create({
      data: {
        direction: params.direction,
        operation: params.operation,
        outcome: params.outcome,
        errorMessage: params.errorMessage ?? null,
        applicationId: params.applicationId ?? null,
        initiatedById: params.initiatedById ?? null,
      },
    });
  } catch (e) {
    console.error('Failed to write NcpIntegrationLog entry', e);
  }
}
