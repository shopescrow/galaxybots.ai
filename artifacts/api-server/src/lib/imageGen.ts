import { openai } from "@workspace/integrations-openai-ai-server";
import { ObjectStorageService } from "./objectStorage";

// gpt-image-1 supported generation sizes.
export type ImageSize = "1024x1024" | "1024x1536" | "1536x1024" | "auto";
export type ImageBackground = "transparent" | "opaque" | "auto";
export type ImageFormat = "png" | "jpeg" | "webp";
export type ImageQuality = "low" | "medium" | "high" | "auto";

export interface GenerateImageOptions {
  prompt: string;
  size?: ImageSize;
  background?: ImageBackground;
  format?: ImageFormat;
  quality?: ImageQuality;
}

export interface GeneratedImage {
  buffer: Buffer;
  contentType: string;
  format: ImageFormat;
}

function contentTypeFor(format: ImageFormat): string {
  if (format === "jpeg") return "image/jpeg";
  if (format === "webp") return "image/webp";
  return "image/png";
}

/**
 * Generate a single image via the OpenAI image model (gpt-image-1) through the
 * Replit AI Integrations proxy. Supports transparent backgrounds (needed for
 * print-on-demand and logos) and the gpt-image-1 size presets.
 */
export async function generateImage(opts: GenerateImageOptions): Promise<GeneratedImage> {
  const format = opts.format ?? "png";
  const response = (await openai.images.generate({
    model: "gpt-image-1",
    prompt: opts.prompt,
    size: opts.size ?? "1024x1024",
    background: opts.background ?? "auto",
    output_format: format,
    quality: opts.quality ?? "auto",
  } as Parameters<typeof openai.images.generate>[0])) as {
    data?: Array<{ b64_json?: string }>;
  };

  const base64 = response.data?.[0]?.b64_json ?? "";
  if (!base64) {
    throw new Error("Image generation returned no data");
  }
  return {
    buffer: Buffer.from(base64, "base64"),
    contentType: contentTypeFor(format),
    format,
  };
}

const storage = new ObjectStorageService();

/**
 * Upload a generated buffer to object storage and return the normalized
 * (/objects/...) entity path that can be persisted on an asset_file record.
 */
export async function uploadBuffer(
  buffer: Buffer,
  contentType: string,
  ownerPrefix: string,
): Promise<string> {
  const uploadUrl = await storage.getObjectEntityUploadURL(ownerPrefix);
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: buffer,
  });
  if (!res.ok) {
    throw new Error(`Failed to upload object: HTTP ${res.status}`);
  }
  return storage.normalizeObjectEntityPath(uploadUrl);
}
