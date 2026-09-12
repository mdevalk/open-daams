// The one file allowed to know about all capabilities at once. Everything outside src/lib/capabilities
// (tooling, reports) should import from here rather than reaching into individual capability folders.
import type { CapabilityDefinition, UseCaseEntry } from './types';

import { capability as applicationLifecycle } from './application-lifecycle/capability';
import { useCases as applicationLifecycleUseCases } from './application-lifecycle/registry';
import { capability as feeInvoicing } from './fee-invoicing/capability';
import { useCases as feeInvoicingUseCases } from './fee-invoicing/registry';
import { capability as permitLifecycle } from './permit-lifecycle/capability';
import { useCases as permitLifecycleUseCases } from './permit-lifecycle/registry';
import { capability as appeals } from './appeals/capability';
import { useCases as appealsUseCases } from './appeals/registry';
import { capability as dataAccessExecution } from './data-access-execution/capability';
import { useCases as dataAccessExecutionUseCases } from './data-access-execution/registry';
import { capability as externalIngestion } from './external-ingestion/capability';
import { useCases as externalIngestionUseCases } from './external-ingestion/registry';

const registry: { capability: CapabilityDefinition; useCases: UseCaseEntry[] }[] = [
  { capability: applicationLifecycle, useCases: applicationLifecycleUseCases },
  { capability: feeInvoicing, useCases: feeInvoicingUseCases },
  { capability: permitLifecycle, useCases: permitLifecycleUseCases },
  { capability: appeals, useCases: appealsUseCases },
  { capability: dataAccessExecution, useCases: dataAccessExecutionUseCases },
  { capability: externalIngestion, useCases: externalIngestionUseCases },
];

export type FlatUseCaseEntry = UseCaseEntry & { capabilityId: string; capabilityName: string };

// If a use case ever genuinely needs a second capability, that's a `secondaryCapabilityIds` field
// here mapping it into both groupings — without moving where the file lives.
export function getAllUseCases(): FlatUseCaseEntry[] {
  return registry.flatMap(({ capability, useCases }) =>
    useCases.map((uc) => ({ ...uc, capabilityId: capability.id, capabilityName: capability.name })),
  );
}

export function getCapabilities(): CapabilityDefinition[] {
  return registry.map((r) => r.capability);
}
