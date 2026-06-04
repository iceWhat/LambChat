import JSZip from "jszip";

export interface PptTextSlide {
  index: number;
  text: string;
}

const SLIDE_PATH_RE = /^ppt\/slides\/slide(\d+)\.xml$/;
const TEXT_NODE_RE = /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g;

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
};

function decodeXmlText(value: string): string {
  return value.replace(/&(#x[\da-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    }
    return XML_ENTITIES[entity] ?? match;
  });
}

export async function extractPptxSlideTexts(
  arrayBuffer: ArrayBuffer,
): Promise<PptTextSlide[]> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const slideEntries = Object.values(zip.files)
    .map((entry) => {
      const match = entry.name.match(SLIDE_PATH_RE);
      if (!match || entry.dir) return null;
      return { entry, index: Number.parseInt(match[1], 10) };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => left.index - right.index);

  const slides = await Promise.all(
    slideEntries.map(async ({ entry, index }) => {
      const xml = await entry.async("text");
      const text = Array.from(xml.matchAll(TEXT_NODE_RE))
        .map((match) => decodeXmlText(match[1]).trim())
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      return text ? { index, text } : null;
    }),
  );

  return slides.filter((slide): slide is PptTextSlide => slide !== null);
}
