/** What to tell someone whose video failed on the AI provider's rate or daily limit, or undefined when it failed for another reason. */
export function limitMessage(message: string): string | undefined {
  if (!/rate.?limit|\b429\b|too many requests|tokens per day|quota/i.test(message)) return undefined;
  const wait = /try again in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i.exec(message);
  const minutes = wait ? Math.ceil(Number(wait[1] ?? 0) * 60 + Number(wait[2] ?? 0) + Number(wait[3] ?? 0) / 60) : 0;
  const when = minutes >= 60 ? `in about ${Math.round(minutes / 60)} hours` : minutes > 1 ? `in about ${minutes} minutes` : 'in a few minutes';
  return `The AI service has hit its usage limit. Try again ${when}; your brief is kept.`;
}
