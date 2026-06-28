// A pragmatic, non-exhaustive list of well-known brand/trademark names used for
// *basic* trademark/brand-name screening at the pre-publish gate. This is a
// heuristic screen — a hit routes the asset to human review, it is not a legal
// determination. Operators can extend per-platform via prohibitedKeywords.
//
// Keep entries lowercase; matching is case-insensitive whole-word.

export const WELL_KNOWN_TRADEMARKS: string[] = [
  // Tech / platforms
  "apple",
  "iphone",
  "ipad",
  "macbook",
  "google",
  "android",
  "youtube",
  "gmail",
  "microsoft",
  "windows",
  "xbox",
  "office",
  "amazon",
  "kindle",
  "alexa",
  "aws",
  "meta",
  "facebook",
  "instagram",
  "whatsapp",
  "threads",
  "netflix",
  "spotify",
  "tiktok",
  "snapchat",
  "twitter",
  "openai",
  "chatgpt",
  "nvidia",
  "adobe",
  "photoshop",
  "canva",
  "etsy",
  "shopify",
  "gumroad",
  // Entertainment / characters (high-risk for printables/merch)
  "disney",
  "pixar",
  "marvel",
  "mickey mouse",
  "star wars",
  "pokemon",
  "pikachu",
  "nintendo",
  "mario",
  "minecraft",
  "fortnite",
  "harry potter",
  "barbie",
  "lego",
  "hello kitty",
  "spongebob",
  "bluey",
  "paw patrol",
  // Apparel / lifestyle
  "nike",
  "adidas",
  "gucci",
  "louis vuitton",
  "chanel",
  "supreme",
  "rolex",
  // Food / beverage
  "coca-cola",
  "coca cola",
  "pepsi",
  "starbucks",
  "mcdonald's",
  "mcdonalds",
  // Auto
  "tesla",
  "ferrari",
  "lamborghini",
  "bmw",
  "mercedes",
];

// Normalize free text to whitespace-separated lowercase tokens for word-boundary
// matching that also catches multi-word marks.
export function screenText(
  text: string,
  marks: string[],
): string[] {
  if (!text) return [];
  const haystack = ` ${text.toLowerCase().replace(/[^a-z0-9'\- ]+/g, " ").replace(/\s+/g, " ")} `;
  const hits = new Set<string>();
  for (const mark of marks) {
    const m = mark.toLowerCase().trim();
    if (!m) continue;
    if (haystack.includes(` ${m} `)) hits.add(mark);
  }
  return [...hits];
}
