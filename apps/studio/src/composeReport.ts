/** What a finished compose job said about itself: repairs, retiming, files that could not travel, and any review error
 *  still standing when the rounds ran out. Undefined means the job reported nothing at all. */
export function composeReport(result: unknown): { notes: string[]; errors: string[] } | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const reported = result as { warnings?: unknown; issues?: unknown };
  const strings = (values: unknown) => (Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string' && value.trim() !== '') : []);
  const notes = strings(reported.warnings), errors = strings(reported.issues);
  return notes.length || errors.length ? { notes, errors } : undefined;
}

/** Only unresolved review faults stop on the making page; repairs alone open the editor, which carries the notes. */
export function composeOutcome(result: unknown): { stop: false; notes: string[] } | { stop: true; report: { notes: string[]; errors: string[] } } {
  const report = composeReport(result);
  if (report?.errors.length) return { stop: true, report };
  return { stop: false, notes: report?.notes ?? [] };
}

/** Where the making page leaves a job's repairs for the editor to show once. */
export const composeNotesKey = (id: string) => `ove-compose-notes:${id}`;
