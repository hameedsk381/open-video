/** What a finished compose job said about itself: repairs, retiming, files that could not travel, and any review error
 *  still standing when the rounds ran out. Undefined means the job reported nothing worth stopping for. */
export function composeReport(result: unknown): { notes: string[]; errors: string[] } | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const reported = result as { warnings?: unknown; issues?: unknown };
  const strings = (values: unknown) => (Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string' && value.trim() !== '') : []);
  const notes = strings(reported.warnings), errors = strings(reported.issues);
  return notes.length || errors.length ? { notes, errors } : undefined;
}
