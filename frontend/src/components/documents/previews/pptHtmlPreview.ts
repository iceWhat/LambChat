const IMAGE_DATA_URI_RE =
  /data:image\/(?:png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=]+)/gi;

function decodeBase64Header(value: string): string {
  if (typeof globalThis.atob !== "function") {
    return "";
  }

  try {
    return globalThis.atob(value.slice(0, 256));
  } catch {
    return "";
  }
}

function isSvgPayload(base64Payload: string): boolean {
  const header = decodeBase64Header(base64Payload).trimStart();
  return /^(?:<\?xml\b[^>]*>\s*)?<svg(?:\s|>)/i.test(header);
}

export function normalizePptxRenderedHtml(html: string): string {
  return html.replace(IMAGE_DATA_URI_RE, (match, payload: string) => {
    if (!isSvgPayload(payload)) {
      return match;
    }

    return `data:image/svg+xml;base64,${payload}`;
  });
}
