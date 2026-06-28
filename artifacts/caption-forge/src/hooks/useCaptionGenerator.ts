import { useState } from "react";

export interface CaptionWriterRequest {
  topic: string;
  tone: string;
  platform: string;
  count: number;
}

export interface CaptionWriterResponse {
  tone: string;
  platform: string;
  captions: string[];
}

export function useCaptionGenerator() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CaptionWriterResponse | null>(null);

  const generate = async (params: CaptionWriterRequest) => {
    setIsLoading(true);
    setError(null);
    setData(null);

    try {
      const response = await fetch("/api/v1/micro-tools/caption-writer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error(`Generation failed: ${response.statusText}`);
      }

      const result = await response.json();
      setData(result);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return {
    generate,
    isLoading,
    error,
    data,
  };
}
