// Prints the use-case-centric and requirement-centric coverage reports described in
// docs/architecture.md. Reads src/lib/capabilities' aggregated use-case list as the master
// backlog (implemented or not), so a use case with no code yet still shows up as "not started"
// instead of silently disappearing from the report.
import fs from 'node:fs';
import path from 'node:path';
import { getAllUseCases, type FlatUseCaseEntry } from '../src/lib/capabilities';

const CAPABILITIES_DIR = path.resolve(__dirname, '../src/lib/capabilities');
const TRACEABILITY_DOC = path.resolve(__dirname, '../docs/d6.4-requirements-traceability.md');

type Status = 'not started' | 'implemented, untested' | 'verified';

async function statusFor(entry: FlatUseCaseEntry): Promise<Status> {
  if (!entry.module) return 'not started';

  const modulePath = path.join(CAPABILITIES_DIR, entry.capabilityId, entry.module);
  try {
    await import(`${modulePath}.ts`);
  } catch {
    return 'not started';
  }

  return fs.existsSync(`${modulePath}.test.ts`) ? 'verified' : 'implemented, untested';
}

function loadRequirementIds(): Set<string> {
  const text = fs.readFileSync(TRACEABILITY_DOC, 'utf8');
  const ids = new Set<string>();
  for (const match of text.matchAll(/^\|\s*(R\d+(?:\.\d+){1,3}(?:\s*\([ab]\))?)\s*\|/gm)) {
    ids.add(match[1].replace(/\s*\([ab]\)/, ''));
  }
  return ids;
}

async function main() {
  const knownRequirementIds = loadRequirementIds();
  const entries = getAllUseCases();
  const statuses = await Promise.all(entries.map(async (entry) => ({ entry, status: await statusFor(entry) })));
  statuses.sort((a, b) => a.entry.capabilityName.localeCompare(b.entry.capabilityName) || a.entry.id.localeCompare(b.entry.id));

  console.log('\n=== Use-case view (grouped by capability) ===\n');
  console.log('capability | id | requirements | status');
  console.log('---|---|---|---');
  for (const { entry, status } of statuses) {
    const unknownIds = entry.satisfies.filter((id) => !knownRequirementIds.has(id));
    if (unknownIds.length) {
      console.warn(`WARNING: ${entry.id} references unknown requirement id(s): ${unknownIds.join(', ')}`);
    }
    console.log(`${entry.capabilityName} | ${entry.id} | ${entry.satisfies.join(', ') || '—'} | ${status}`);
  }

  console.log('\n=== Requirement view (only requirements claimed by a use case) ===\n');
  console.log('requirement | use case(s) | verified');
  console.log('---|---|---');
  const byRequirement = new Map<string, { useCaseIds: string[]; verified: boolean }>();
  for (const { entry, status } of statuses) {
    for (const reqId of entry.satisfies) {
      const row = byRequirement.get(reqId) ?? { useCaseIds: [], verified: false };
      row.useCaseIds.push(entry.id);
      row.verified = row.verified || status === 'verified';
      byRequirement.set(reqId, row);
    }
  }
  for (const [reqId, row] of [...byRequirement.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`${reqId} | ${row.useCaseIds.join(', ')} | ${row.verified ? 'yes' : 'no'}`);
  }

  const notStarted = statuses.filter((s) => s.status === 'not started').length;
  const untested = statuses.filter((s) => s.status === 'implemented, untested').length;
  const verified = statuses.filter((s) => s.status === 'verified').length;
  console.log(`\n${verified} verified, ${untested} implemented but untested, ${notStarted} not started (of ${statuses.length} total).\n`);
}

main();
