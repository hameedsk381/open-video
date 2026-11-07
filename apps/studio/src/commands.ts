export type Command = { id: string; label: string; hint?: string; group: string; run: () => void };

/** Commands whose label, hint or group contains every word of the query. */
export function filterCommands<T extends { label: string; hint?: string; group: string }>(query: string, commands: T[]): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return commands;
  return commands.filter(command => {
    const haystack = `${command.label} ${command.hint ?? ''} ${command.group}`.toLowerCase();
    return words.every(word => haystack.includes(word));
  });
}
