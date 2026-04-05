import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function fetchAllPages<T>(
  url: string,
  options?: RequestInit,
): Promise<T[]> {
  const allItems: T[] = [];
  let cursor: number | null = null;
  const separator = url.includes("?") ? "&" : "?";

  do {
    const pageUrl = cursor !== null ? `${url}${separator}cursor=${cursor}&limit=200` : `${url}${separator}limit=200`;
    const res = await fetch(pageUrl, options);
    if (!res.ok) break;
    const json = await res.json();
    const data: T[] = Array.isArray(json) ? json : (json.data ?? []);
    allItems.push(...data);
    cursor = json.nextCursor ?? null;
  } while (cursor !== null);

  return allItems;
}
