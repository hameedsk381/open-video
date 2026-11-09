// The AI layer is deliberately outside the render path: it produces the same composition JSON, assets and
// narration files a person would write, and the deterministic engine checks and renders them.
export * from './providers';
export * from './compose';
export * from './assets';
// Revision history lives in @ove/storage (it is about files on disk, not about AI); re-exported so callers keep one import.
export { ensureBaseline, listRevisions, restoreRevision, saveRevision, summarizeChange, summarizeProductionChange, type Revision, type RevisionKind, type RevisionMeta } from '@ove/storage';
export * from './template';
export { applyFixes, isFixReply, type Fix } from './patch';
export * from './narrate';
export * from './voiceover';
export * from './edit';
export * from './shorts';
export * from './retime';
export * from './image';
export * from './batch';
export * from './project';
export * from './agent';
export * from './direction';
export * from './critique';
export * from './brand-look';
export * from './brand-scraper';
export * from './brand-css';
export * from './scenes';
export * from './content';
export * from './registry';
export * from './edge-tts';
export * from './plan';
export * from './copy';
export * from './smart';
export * from './explainer';
export { extractJson, sanitizeCompositionJson } from './json';
export { systemPrompt, userPrompt, planSystemPrompt, planUserPrompt, isMotionPlan, refineUserPrompt, refineOutlinePrompt, compositionOutline, refineOutlineChars, ratioName, type PromptOptions, type MotionPlan, type MotionBeat } from './prompt';
