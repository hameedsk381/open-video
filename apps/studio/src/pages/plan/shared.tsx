import { type Production, type ProductionShot } from '../../api';
import { planSeconds } from '../../productionPlan';
import { Field } from '../../ui';

export type Edit = (mutate: (draft: any) => void) => void;

export const transitions = ['push', 'fade', 'slide', 'wipe', 'zoom', 'dip'] as const;

export const textures = ['none', 'grid', 'dots', 'scanlines', 'paper'] as const;

export const exportFormats = ['mp4', 'webm', 'mov', 'gif', 'png'] as const;

export const productionTypes = ['motion-graphics', 'cinematic', 'story', 'commercial', 'explainer', 'music-video', 'hybrid'] as const;

export function TextField({ label, value, onChange, hint, placeholder, rows }: { label: string; value?: string | number; onChange: (value: string) => void; hint?: string; placeholder?: string; rows?: number }) {
  return (
    <Field label={label} hint={hint}>
      {rows ? (
        <textarea className="input" style={{ minHeight: rows * 22 }} value={value ?? ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
      ) : (
        <input className="input" value={value ?? ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
      )}
    </Field>
  );
}

export function NumberField({ label, value, onChange, hint, min = 0, step = 1 }: { label: string; value?: number; onChange: (value: number | undefined) => void; hint?: string; min?: number; step?: number | 'any' }) {
  return (
    <Field label={label} hint={hint}>
      <input className="input" type="number" min={min} step={step} value={value ?? ''} onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />
    </Field>
  );
}

export function SelectField({ label, value, options, onChange, hint }: { label: string; value?: string; options: readonly { value: string; label: string }[]; onChange: (value: string) => void; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <select className="input" value={value ?? ''} onChange={e => onChange(e.target.value)}>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </Field>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value?: string; onChange: (value: string) => void }) {
  const valid = /^#[0-9a-fA-F]{6}$/.test(value ?? '');
  return (
    <Field label={label}>
      <div className="color-field">
        <input type="color" value={valid && value ? value : '#000000'} onChange={e => onChange(e.target.value)} />
        <input className="input" value={value ?? ''} placeholder="#0b0c10" onChange={e => onChange(e.target.value)} />
      </div>
    </Field>
  );
}

export const title = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function setMedia(shot: any, key: 'image' | 'video' | 'fit', value: string) {
  shot.media ??= {};
  if (key === 'fit') shot.media.fit = value; else if (value.trim()) shot.media[key] = value.trim(); else delete shot.media[key];
  if (!shot.media.image && !shot.media.video && !shot.media.fit) delete shot.media;
}

/* ==================== brief ==================== */

export function approveTake(edit: Edit, shot: ProductionShot, assetId: string) {
  edit(draft => {
    const target = (draft.shots ?? []).find((candidate: any) => candidate.id === shot.id);
    if (!target) return;
    target.generation ??= {};
    target.generation.status = 'approved';
    target.generation.assetId = assetId;
  });
}

export function rejectTake(edit: Edit, shot: ProductionShot) {
  edit(draft => {
    const target = (draft.shots ?? []).find((candidate: any) => candidate.id === shot.id);
    if (!target?.generation) return;
    target.generation.status = 'rejected';
  });
}

export function ClockNote({ plan }: { plan: Production }) {
  const seconds = planSeconds(plan);
  return (
    <span>
      {plan.shots?.length ?? 0} shot{(plan.shots?.length ?? 0) === 1 ? '' : 's'} · {seconds}s planned
    </span>
  );
}

/* ==================== fields ==================== */
