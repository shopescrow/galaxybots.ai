import { openai } from "@workspace/integrations-openai-ai-server";

export const CONTENT_TYPES = ["blog", "linkedin", "twitter", "email", "press_release", "case_study"] as const;
export const TONES = ["professional", "conversational", "thought_leadership", "educational", "bold"] as const;

const SYSTEM_PROMPTS: Record<string, string> = {
  blog: `You are an expert SEO content writer. Generate a well-structured blog post with:
- An engaging H1 title
- A compelling meta description (150-160 characters)
- Clear H2/H3 subheadings
- SEO-optimized content with natural keyword integration
- A strong conclusion with a call to action
Return the content in markdown format.`,
  linkedin: `You are a LinkedIn content strategist. Generate a professional LinkedIn article/post with:
- An attention-grabbing opening hook
- Professional but engaging tone
- Strategic use of line breaks for readability
- Relevant hashtags at the end
- A call to engagement (question or prompt)
Return the content in plain text format optimized for LinkedIn.`,
  twitter: `You are a Twitter/X thread strategist. Generate a compelling thread with:
- A hook tweet that drives curiosity
- 5-8 tweets that tell a story or share insights
- Each tweet under 280 characters
- A closing tweet with a call to action
Format each tweet on its own line, prefixed with the tweet number (1/, 2/, etc).`,
  email: `You are an email marketing expert. Generate a newsletter email with:
- A compelling subject line (marked as SUBJECT:)
- A preview text (marked as PREVIEW:)
- An engaging greeting
- Well-structured body content
- A clear call to action
- A professional sign-off
Return in markdown format with SUBJECT: and PREVIEW: headers.`,
  press_release: `You are a PR communications specialist. Generate a press release with:
- A headline in AP style
- A dateline
- A strong lead paragraph (who, what, when, where, why)
- Supporting body paragraphs with quotes
- A boilerplate company description
- Contact information placeholder
Return in standard press release format.`,
  case_study: `You are a B2B content strategist. Generate a case study with:
- Client name/industry context
- The challenge/problem faced
- The solution implemented
- Measurable results and outcomes
- Key takeaways
- A testimonial quote placeholder
Return in markdown format with clear sections.`,
};

export function getSystemPrompt(contentType: string): string {
  return SYSTEM_PROMPTS[contentType] || SYSTEM_PROMPTS.blog;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

interface GenerateContentParams {
  contentType: string;
  topic: string;
  tone: string;
  keywords?: string[];
  clientName: string;
  clientIndustry: string;
}

interface GeneratedContent {
  title: string;
  slug: string;
  body: string;
  metaDescription: string;
  contentType: string;
  topic: string;
  tone: string;
  keywords: string[];
}

export async function generateContent(params: GenerateContentParams): Promise<GeneratedContent> {
  const systemPrompt = getSystemPrompt(params.contentType);
  const keywordList = params.keywords && params.keywords.length > 0 ? params.keywords.join(", ") : "";

  const userPrompt = `Industry: ${params.clientIndustry}
Company: ${params.clientName}
Topic: ${params.topic}
Tone: ${params.tone}
${keywordList ? `Keywords to incorporate: ${keywordList}` : ""}

Generate the content now.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 3000,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const body = completion.choices[0]?.message?.content ?? "";

  const titleMatch = body.match(/^#\s+(.+)$/m) || body.match(/^(.+)\n/);
  const suggestedTitle = titleMatch ? titleMatch[1].replace(/^#+\s*/, "").trim() : params.topic;
  const suggestedSlug = slugify(suggestedTitle);

  const metaMatch = body.match(/meta description[:\s]*(.{50,160})/i);
  const metaDescription = metaMatch ? metaMatch[1].trim() : body.slice(0, 155).trim() + "...";

  return {
    title: suggestedTitle,
    slug: suggestedSlug,
    body,
    metaDescription,
    contentType: params.contentType,
    topic: params.topic,
    tone: params.tone,
    keywords: params.keywords ?? [],
  };
}
