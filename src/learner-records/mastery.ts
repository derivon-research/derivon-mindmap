/**
 * The application's side of `state.json`: read a learner's mastery, derive the known set from
 * it, and write the records a learner or a workspace default puts there.
 *
 * Mastery is not application state. The known set is not stored anywhere; it is
 * **the set of concepts with a `complete` record**, derived on demand
 * ([ADR-0012](../../docs/adr/0012-learning-state-is-mastery.md),
 * [learner records](../../docs/learner-records.md)). Every record that is *not* a judgement
 * shares the one `status` axis and is told apart by `data`, never by a second status:
 * `selfReported` is the learner's own claim, `orientationSeed` is the workspace's declared
 * default. The interface can only tell them apart because the file does.
 *
 * A write is a read-modify-replace under the file version it read, so a write from the script
 * command surface in between loses cleanly and is retried once
 * ([ADR-0009](../../docs/adr/0009-persist-learner-records-outside-the-workspace.md)). A
 * judgement is never overwritten by a claim and never withdrawn by a "take it back": the
 * learner owns their own claim and the workspace's default, not a judgement the application
 * made.
 */
import type { LearningState, MasteryRecord } from './protocol';
import type { LearnerRecordStore } from './store';

export const EMPTY_MASTERY: LearningState = { concepts: {}, derivations: {} };

export type MasteryReading = {
  readonly state: LearningState;
  /** `missing` means nothing has been assessed here yet, which is not an error. */
  readonly presence: 'missing' | 'present';
  /** An unreadable `state.json`. It is reported; it is never quietly replaced with an empty record. */
  readonly issue: string | null;
};

/** Where a `complete` concept record came from. `judged` is the application's own assessment. */
export type MasterySource = 'selfReported' | 'orientationSeed' | 'judged';

/** Where this record's knowledge came from, or `null` when there is no `complete` record. */
export function masterySourceOf(record: MasteryRecord | undefined): MasterySource | null {
  if (record?.status !== 'complete') return null;
  if (record.data?.selfReported === true) return 'selfReported';
  if (record.data?.orientationSeed === true) return 'orientationSeed';
  return 'judged';
}

/**
 * A claim the learner may take back: their own self-report or the workspace's default. A
 * judgement — `complete` or `incomplete` — is not theirs to withdraw or overwrite, so a
 * request against one changes nothing.
 */
export function isWithdrawable(record: MasteryRecord | undefined): boolean {
  const source = masterySourceOf(record);
  return source === 'selfReported' || source === 'orientationSeed';
}

/** The live known set: every concept this learner has reached, from any source. */
export function knownConceptIds(state: LearningState): readonly string[] {
  return [...conceptSources(state).keys()].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

/** The source of every known concept, so the interface never shows one kind as another. */
export function conceptSources(state: LearningState): ReadonlyMap<string, MasterySource> {
  const sources = new Map<string, MasterySource>();
  for (const [conceptId, record] of Object.entries(state.concepts)) {
    const source = masterySourceOf(record);
    if (source !== null) sources.set(conceptId, source);
  }
  return sources;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function readMastery(store: LearnerRecordStore): Promise<MasteryReading> {
  try {
    const stored = await store.readLearningState();
    return stored.presence === 'present'
      ? { state: stored.state, presence: 'present', issue: null }
      : { state: EMPTY_MASTERY, presence: 'missing', issue: null };
  } catch (error) {
    return { state: EMPTY_MASTERY, presence: 'present', issue: messageOf(error) };
  }
}

/** One concept to write as reached, and which source says so. */
export type MasteryClaim = {
  readonly conceptId: string;
  readonly basis: string;
  /** A writer only ever claims to be one of these two; `judged` is the application's own. */
  readonly source: 'selfReported' | 'orientationSeed';
};

export type MasteryWrite = {
  readonly claimed: readonly MasteryClaim[];
  /** Records to take back. A judgement is left alone. */
  readonly withdrawn: readonly string[];
};

function claimedRecord(existing: MasteryRecord | undefined, claim: MasteryClaim): MasteryRecord {
  // The source is replaced, not merged: a workspace default the learner has made their own
  // must stop reading as a default, and nothing else may survive as a stale marker.
  const rest = Object.fromEntries(Object.entries(existing?.data ?? {})
    .filter(([key]) => key !== 'selfReported' && key !== 'orientationSeed'));
  return { status: 'complete', basis: claim.basis, data: { ...rest, [claim.source]: true } };
}

function applyWrite(state: LearningState, write: MasteryWrite): LearningState {
  const withdrawn = new Set(write.withdrawn.filter((conceptId) => isWithdrawable(state.concepts[conceptId])));
  const concepts: Record<string, MasteryRecord> = Object.fromEntries(
    Object.entries(state.concepts).filter(([conceptId]) => !withdrawn.has(conceptId)));
  let changed = withdrawn.size > 0;
  for (const claim of write.claimed) {
    const existing = state.concepts[claim.conceptId];
    // Only a learner-owned claim may be replaced. A judgement — `complete` or `incomplete` —
    // already says something about this concept that the learner's claim must not erase,
    // and carrying its `data` into a claim would misattribute it.
    if (existing !== undefined && !isWithdrawable(existing)) continue;
    if (existing?.basis === claim.basis && masterySourceOf(existing) === claim.source) continue;
    concepts[claim.conceptId] = claimedRecord(existing, claim);
    changed = true;
  }
  return changed ? { concepts, derivations: state.derivations } : state;
}

/**
 * Judgements to land, by the map they belong to. A judgement is exactly a `MasteryRecord` —
 * the protocol's own name for it — and concept mastery and derivation mastery are isomorphic,
 * so one write handles both. Unlike a claim, a judgement replaces whatever was there: a claim
 * is the learner's word and an earlier judgement is superseded by a later one, and both answer
 * the same question from different evidence. The protocol's shape constraints are the
 * serializer's job; this never reaches a file with a record the reader would refuse.
 */
export type JudgementWrite = {
  readonly concepts?: Readonly<Record<string, MasteryRecord>>;
  readonly derivations?: Readonly<Record<string, MasteryRecord>>;
};

const sameData = (left: Readonly<Record<string, unknown>> | undefined, right: Readonly<Record<string, unknown>> | undefined) =>
  JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

function applyJudgements(
  current: Readonly<Record<string, MasteryRecord>>,
  judgements: Readonly<Record<string, MasteryRecord>> | undefined,
): { readonly records: Readonly<Record<string, MasteryRecord>>; readonly changed: boolean } {
  if (judgements === undefined) return { records: current, changed: false };
  const records = { ...current };
  let changed = false;
  for (const [objectId, judgement] of Object.entries(judgements)) {
    const existing = records[objectId];
    if (existing !== undefined && existing.status === judgement.status
      && existing.basis === judgement.basis && sameData(existing.data, judgement.data)) continue;
    records[objectId] = judgement;
    changed = true;
  }
  return { records, changed };
}

function applyJudgementWrite(state: LearningState, write: JudgementWrite): LearningState {
  const concepts = applyJudgements(state.concepts, write.concepts);
  const derivations = applyJudgements(state.derivations, write.derivations);
  return concepts.changed || derivations.changed
    ? { concepts: concepts.records, derivations: derivations.records }
    : state;
}

/**
 * Land judgements, twice at most. The second attempt starts from a fresh read, so a record
 * another writer landed in between is preserved rather than overwritten. An unreadable file
 * throws on the read: replacing it would destroy records nobody can read.
 */
export async function writeJudgements(
  store: LearnerRecordStore,
  write: JudgementWrite,
): Promise<MasteryReading> {
  return rewrite(store, (current) => applyJudgementWrite(current, write));
}

/**
 * Read–modify–replace under the version that was read, twice at most.
 *
 * The second attempt starts from a fresh read, so a record another writer landed in between is
 * preserved rather than overwritten; a writer that keeps losing loses cleanly instead of
 * looping. An unreadable file throws on the read, which is the point: replacing it would
 * destroy records nobody can read.
 */
async function rewrite(
  store: LearnerRecordStore,
  change: (state: LearningState) => LearningState,
): Promise<MasteryReading> {
  for (let attempt = 0; ; attempt += 1) {
    const stored = await store.readLearningState();
    const current = stored.presence === 'present' ? stored.state : EMPTY_MASTERY;
    const next = change(current);
    if (next === current) return { state: current, presence: stored.presence, issue: null };
    const precondition = stored.presence === 'present'
      ? { presence: 'present' as const, version: stored.version }
      : { presence: 'missing' as const };
    try {
      await store.writeLearningState(next, precondition);
      return { state: next, presence: 'present', issue: null };
    } catch (error) {
      if (attempt >= 1) throw error;
    }
  }
}

/**
 * Apply mastery claims: only the learner's own word and the workspace's default move, and a
 * judgement — `complete` or `incomplete` — is never overwritten by either.
 */
export async function writeMastery(
  store: LearnerRecordStore,
  write: MasteryWrite,
): Promise<MasteryReading> {
  return rewrite(store, (current) => applyWrite(current, write));
}
