// The AI layer is deliberately outside the render path: it produces the same composition JSON, assets and
// narration files a person would write, and the deterministic engine checks and renders them.
export * from './providers';
export * from './compose';
export * from './assets';
export * from './history';
export * from './template';
export { applyFixes, isFixReply, type Fix } from './patch';
export * from './narrate';
export * from './voiceover';
export * from './image';
export * from './batch';
export * from './project';
export { extractJson, sanitizeCompositionJson } from './json';
export { systemPrompt, userPrompt, refineUserPrompt, refineOutlinePrompt, compositionOutline, refineOutlineChars, ratioName, type PromptOptions } from './prompt';
