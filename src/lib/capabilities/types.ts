export type CapabilityDefinition = {
  id: string;
  name: string;
  description: string;
};

export type UseCaseEntry = {
  id: string;
  name: string;
  /** Rx.x.x IDs from docs/d6.4-requirements-traceability.md — filled in once the use case is built. */
  satisfies: string[];
  /** Path relative to this capability's own folder, e.g. './use-cases/checklist-checks'. */
  module: string | null;
};
