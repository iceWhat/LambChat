import { getFullUrl } from "../../../../services/api/config";

export interface GeneratedImageResult {
  url: string;
  name: string;
  contentType?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fileNameFromUrl(url: string): string {
  try {
    const baseUrl =
      typeof window === "undefined"
        ? "http://localhost"
        : window.location.origin;
    const pathname = new URL(url, baseUrl).pathname;
    const lastSegment = pathname.split("/").filter(Boolean).pop();
    return lastSegment ? decodeURIComponent(lastSegment) : url;
  } catch {
    const lastSegment = url.split("?")[0]?.split("/").filter(Boolean).pop();
    return lastSegment ? decodeURIComponent(lastSegment) : url;
  }
}

function isImageEntry(entry: Record<string, unknown>): boolean {
  const contentType =
    typeof entry.content_type === "string"
      ? entry.content_type
      : typeof entry.contentType === "string"
        ? entry.contentType
        : "";

  if (contentType.toLowerCase().startsWith("image/")) return true;

  const url = typeof entry.url === "string" ? entry.url : "";
  return /\.(png|jpe?g|webp|gif|avif|bmp|svg)(?:$|[?#])/i.test(url);
}

export function extractGeneratedImageResults(
  result: unknown,
  apiBase?: string,
): GeneratedImageResult[] {
  if (!isRecord(result) || !Array.isArray(result.images)) return [];

  return result.images
    .filter(isRecord)
    .filter((entry) => typeof entry.url === "string" && isImageEntry(entry))
    .map((entry) => {
      const url = entry.url as string;
      const resolvedUrl = getFullUrl(url, apiBase) || url;
      const contentType =
        typeof entry.content_type === "string"
          ? entry.content_type
          : typeof entry.contentType === "string"
            ? entry.contentType
            : undefined;

      return {
        url: resolvedUrl,
        name: fileNameFromUrl(url),
        contentType,
      };
    });
}
