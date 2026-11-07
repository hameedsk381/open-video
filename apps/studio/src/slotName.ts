// A readable name for an editable text layer. Layer ids come from templates and the AI ("steps-kicker", "cta-title"); people should read
// "Eyebrow" and "Call to action headline". A leading word that repeats the scene's own name is dropped.
const names: Record<string, string> = {
  kicker: 'eyebrow', eyebrow: 'eyebrow', title: 'headline', headline: 'headline', heading: 'headline', subtitle: 'subheading', subhead: 'subheading',
  detail: 'supporting text', body: 'body text', text: 'text', note: 'note', cta: 'call to action', list: 'list', label: 'label', caption: 'caption',
  quote: 'quote', author: 'name', role: 'role', price: 'price', code: 'code', tagline: 'tagline', brand: 'brand name', logo: 'logo text',
};
export function slotName(scene: string, id: string): string {
  const words = id.split(/[-_.\s]+/).filter(Boolean);
  const sceneWords = scene.toLowerCase().split(/\W+/).filter(Boolean);
  const rest = words.filter((word, index) => !(index === 0 && words.length > 1 && sceneWords.includes(word.toLowerCase())));
  let text = (rest.length ? rest : words).map(word => names[word.toLowerCase()] ?? word.toLowerCase()).join(' ');
  // "Call to action · Call to action headline" says the scene twice.
  const own = scene.trim().toLowerCase();
  if (own && text.startsWith(own + ' ')) text = text.slice(own.length + 1);
  return text.charAt(0).toUpperCase() + text.slice(1);
}
