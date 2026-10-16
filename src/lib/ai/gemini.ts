export function buildVideoPrompt(_analysis: unknown, conceptPrompt?: string): string {
  if (typeof conceptPrompt !== 'string' || !conceptPrompt.trim()) {
    throw new Error('An approved Maharaja event and category prompt is required for video generation.');
  }
  return conceptPrompt.trim();
}
