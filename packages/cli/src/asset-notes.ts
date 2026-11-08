// What `validate` says about assets: rights, consent and files that changed since they were recorded. Nothing here fails a validation.
import { verifyAssetHashes } from '@ove/assets';
import { assetNotes, type Asset, type AssetNote } from '@ove/schema';

export async function collectAssetNotes(assets: readonly Asset[], baseDir: string): Promise<AssetNote[]> {
  return [...assetNotes(assets), ...await verifyAssetHashes(assets, baseDir)];
}

/** One line per concern; assets with no recorded rights are listed together rather than one note each. */
export function assetNoteLines(notes: readonly AssetNote[]): string[] {
  const lines: string[] = [];
  const unrecorded = notes.filter(note => note.code === 'rights-unrecorded');
  if (unrecorded.length) {
    const names = unrecorded.map(note => note.assetId), shown = names.slice(0, 5).join(', ');
    lines.push(`note: ${unrecorded.length} asset${unrecorded.length === 1 ? ' has' : 's have'} no recorded rights, so commercial use is unknown (${shown}${names.length > 5 ? `, and ${names.length - 5} more` : ''})`);
  }
  for (const note of notes) if (note.code !== 'rights-unrecorded') lines.push(`${note.severity === 'warning' ? 'warning' : 'note'}: ${note.message}`);
  return lines;
}
