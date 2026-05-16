import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collectSessionImageGalleryItems } from "../sessionImageGallery.tsx";
import type { Message } from "../../../../types";

function createMessage(overrides: Partial<Message>): Message {
  return {
    id: overrides.id ?? "message-1",
    role: overrides.role ?? "assistant",
    content: overrides.content ?? "",
    timestamp: overrides.timestamp ?? new Date("2026-05-17T00:00:00.000Z"),
    ...overrides,
  };
}

test("collects session images from attachments, markdown, and reveal_file tools in message order", () => {
  const messages: Message[] = [
    createMessage({
      id: "user-1",
      role: "user",
      content: "look ![inline](/inline-user.png)",
      attachments: [
        {
          id: "attachment-image",
          key: "uploads/attachment.png",
          name: "attachment.png",
          type: "image",
          mimeType: "image/png",
          size: 12,
          url: "/attachment.png",
        },
        {
          id: "attachment-pdf",
          key: "uploads/file.pdf",
          name: "file.pdf",
          type: "document",
          mimeType: "application/pdf",
          size: 34,
          url: "/file.pdf",
        },
      ],
    }),
    createMessage({
      id: "assistant-1",
      role: "assistant",
      content: "",
      parts: [
        {
          type: "text",
          content: "rendered ![chart](/chart.png)",
        },
        {
          type: "tool",
          name: "reveal_file",
          success: true,
          args: { path: "/tmp/generated.png" },
          result: JSON.stringify({
            key: "revealed/generated.png",
            url: "/generated.png",
            name: "generated.png",
            type: "image",
            mimeType: "image/png",
            size: 56,
            _meta: { path: "/tmp/generated.png" },
          }),
        },
      ],
    }),
  ];

  const items = collectSessionImageGalleryItems(messages);

  assert.deepEqual(
    items.map((item) => [item.id, item.src, item.alt]),
    [
      [
        "user-1:attachment:attachment-image",
        "/attachment.png",
        "attachment.png",
      ],
      ["user-1:content:image:0", "/inline-user.png", "inline"],
      ["assistant-1:part:0:image:0", "/chart.png", "chart"],
      ["assistant-1:part:1:reveal-file", "/generated.png", "generated.png"],
    ],
  );
});

test("ChatView provides a session image gallery around chat messages", () => {
  const source = readFileSync(
    new URL("../../../layout/AppContent/ChatView.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /SessionImageGalleryProvider/);
  assert.match(source, /messages=\{messages\}/);
});

test("conversation image entry points use the session gallery when available", () => {
  const markdownSource = readFileSync(
    new URL("../MarkdownContent.tsx", import.meta.url),
    "utf8",
  );
  const userBubbleSource = readFileSync(
    new URL("../UserMessageBubble.tsx", import.meta.url),
    "utf8",
  );
  const fileRevealSource = readFileSync(
    new URL("../items/FileRevealItem.tsx", import.meta.url),
    "utf8",
  );

  assert.match(markdownSource, /useSessionImageGallery/);
  assert.match(markdownSource, /sessionImageGallery\?\.openImage/);
  assert.match(userBubbleSource, /useSessionImageGallery/);
  assert.match(userBubbleSource, /sessionImageGallery\?\.openImage/);
  assert.match(fileRevealSource, /useSessionImageGallery/);
  assert.match(fileRevealSource, /sessionImageGallery\?\.openImage/);
});

test("session image gallery is independent from RevealArtifactsSummary", () => {
  const sessionGallerySource = readFileSync(
    new URL("../sessionImageGallery.tsx", import.meta.url),
    "utf8",
  );
  const revealSummarySource = readFileSync(
    new URL("../RevealArtifactsSummary.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(sessionGallerySource, /RevealArtifactsSummary/);
  assert.doesNotMatch(sessionGallerySource, /collectRevealArtifacts/);
  assert.doesNotMatch(sessionGallerySource, /buildRevealArtifactTree/);
  assert.doesNotMatch(
    sessionGallerySource,
    /getRevealArtifactImagePreviewItems/,
  );
  assert.doesNotMatch(sessionGallerySource, /from "\.\/revealArtifacts"/);

  assert.doesNotMatch(revealSummarySource, /useSessionImageGallery/);
  assert.doesNotMatch(revealSummarySource, /SessionImageGalleryProvider/);
  assert.doesNotMatch(revealSummarySource, /sessionImageGallery/);
});
