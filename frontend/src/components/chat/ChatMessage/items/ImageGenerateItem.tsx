import { memo, useMemo, useState, useCallback } from "react";
import { clsx } from "clsx";
import { Sparkles, ImageIcon, Tag, Layers } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CollapsiblePill, ImageViewer } from "../../../common";
import { extractText } from "./toolUtils";
import { extractGeneratedImageResults } from "./toolImageResults";
import { openPersistentToolPanel } from "./persistentToolPanelState";
import { ToolArgsBlock } from "./ToolArgsBlock";
import { ToolInlineDetails } from "./ToolInlineDetails";
import { ToolHoverCopyButton } from "./ToolHoverCopyButton";
import { ToolDurationFooter } from "./ToolDurationFooter";
import { useSessionImageGallery } from "../sessionImageGallery";

const ImageGenerateItem = memo(function ImageGenerateItem({
  args,
  result,
  success,
  isPending,
  cancelled,
  startedAt,
  completedAt,
}: {
  args: Record<string, unknown>;
  result?: string | Record<string, unknown>;
  success?: boolean;
  isPending?: boolean;
  cancelled?: boolean;
  startedAt?: string;
  completedAt?: string;
}) {
  const { t } = useTranslation();
  const sessionImageGallery = useSessionImageGallery();
  const [imageViewerSrc, setImageViewerSrc] = useState<string | null>(null);
  const durationFooter = (
    <ToolDurationFooter startedAt={startedAt} completedAt={completedAt} />
  );

  const openImagePreview = useCallback(
    (src: string) => {
      sessionImageGallery?.openImage(src);
      if (!sessionImageGallery) {
        setImageViewerSrc(src);
      }
    },
    [sessionImageGallery],
  );

  const prompt = (args.prompt as string) || "";
  const size = (args.size as string) || "";
  const quality = (args.quality as string) || "";
  const outputFormat = (args.output_format as string) || "";
  const model = (args.model as string) || "";
  const style = (args.style as string) || "";

  const images = useMemo(() => {
    let parsed: unknown = result;
    if (typeof result === "string") {
      try {
        parsed = JSON.parse(result);
      } catch {
        return [];
      }
    }
    return extractGeneratedImageResults(parsed);
  }, [result]);

  const fallbackText = useMemo(() => {
    if (images.length > 0) return "";
    const text = extractText(result);
    if (!text) return "";
    try {
      const obj = JSON.parse(text);
      if (obj.revised_prompt) return obj.revised_prompt as string;
      if (obj.error) return obj.error as string;
    } catch {
      // not JSON
    }
    return text;
  }, [result, images.length]);

  const canExpand = !!prompt || images.length > 0 || !!fallbackText;
  const status = isPending
    ? "loading"
    : cancelled
      ? "cancelled"
      : success
        ? "success"
        : "error";

  // ── detail (panel) content ─────────────────────────────────────────

  const detailContent = canExpand && (
    <div className="p-4 sm:p-5 space-y-3">
      {/* ── Character Card Header ── */}
      <div
        className={clsx(
          "flex items-center gap-3 rounded-xl p-3",
          "bg-gradient-to-r from-violet-50 to-fuchsia-50/80 dark:from-violet-950/30 dark:to-fuchsia-950/20",
          "border border-violet-200/60 dark:border-violet-800/40",
          "hover:border-violet-300 dark:hover:border-violet-700/50",
          "transition-colors",
        )}
      >
        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg flex items-center justify-center text-xl sm:text-2xl leading-none shrink-0 bg-white/60 dark:bg-white/10 shadow-sm">
          🎨
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-theme-text font-semibold truncate">
            {t("chat.message.toolImageGenerate")}
          </div>
          <div className="text-xs text-theme-text-tertiary truncate mt-0.5">
            {t(
              "chat.message.toolImageGenerateDesc",
              "AI-powered image generation",
            )}
          </div>
        </div>
        {images.length > 0 && (
          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/60 dark:bg-white/10 text-violet-600 dark:text-violet-300 text-xs font-medium shadow-sm">
            <ImageIcon size={10} />
            {images.length}
          </span>
        )}
      </div>

      {/* ── Tags ── */}
      <div className="flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-100/60 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 text-xs">
          <Tag size={9} className="opacity-50" />
          image-generation
        </span>
        {model && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-100/60 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 text-xs">
            <Layers size={9} className="opacity-50" />
            {model}
          </span>
        )}
        {size && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-100/60 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 text-xs">
            <ImageIcon size={10} className="opacity-50" />
            {size}
          </span>
        )}
        {quality && (
          <span className="px-2 py-0.5 rounded-md bg-violet-100/60 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 text-xs capitalize">
            {quality}
          </span>
        )}
        {style && (
          <span className="px-2 py-0.5 rounded-md bg-violet-100/60 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 text-xs capitalize">
            {style}
          </span>
        )}
        {outputFormat && (
          <span className="px-2 py-0.5 rounded-md bg-violet-100/60 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 text-xs font-mono uppercase">
            {outputFormat}
          </span>
        )}
      </div>

      {/* ── Prompt ── */}
      {prompt && (
        <div className="group/args relative rounded-lg border border-theme-border overflow-hidden">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-theme-bg-subtle text-theme-text-tertiary text-xs">
            <Sparkles
              size={12}
              className="text-violet-500 dark:text-violet-400"
            />
            Prompt
          </div>
          <div className="px-3 py-2 text-sm text-theme-text-secondary whitespace-pre-wrap break-words leading-relaxed">
            {prompt}
          </div>
          <ToolHoverCopyButton text={prompt} position="args" />
        </div>
      )}

      {/* ── Image Gallery ── */}
      {images.length > 0 && (
        <div
          className={clsx(
            "grid gap-2.5",
            images.length === 1 ? "grid-cols-1" : "grid-cols-2",
          )}
        >
          {images.map((img, i) => (
            <div
              key={i}
              className={clsx(
                "group/img relative rounded-xl overflow-hidden",
                "border border-theme-border",
                "hover:border-violet-200 dark:hover:border-violet-800/50 hover:shadow-lg",
                "transition-all duration-200",
                "cursor-pointer",
              )}
              onClick={() => openImagePreview(img.url)}
            >
              <img
                src={img.url}
                alt={img.name}
                className="w-full aspect-square object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity">
                <div className="absolute bottom-2 left-2 right-2">
                  <span className="text-white/90 text-[11px] font-medium truncate block drop-shadow-sm">
                    {img.name}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Fallback Text ── */}
      {fallbackText && (
        <pre className="group/result relative text-xs text-theme-text-tertiary whitespace-pre-wrap break-words p-3 rounded-lg bg-theme-bg border border-theme-border">
          {fallbackText}
          <ToolHoverCopyButton
            text={fallbackText}
            position="result"
            copyButtonClassName="!bg-theme-bg-card/80 !rounded-md !border !border-theme-border"
          />
        </pre>
      )}
    </div>
  );

  // ── compact (inline) content ────────────────────────────────────────

  const compactContent = canExpand && (
    <ToolInlineDetails>
      {/* Mini character card */}
      <div
        className={clsx(
          "flex items-center gap-2 px-2 py-1.5 rounded-lg mb-2",
          "bg-gradient-to-r from-violet-50/80 to-fuchsia-50/60 dark:from-violet-950/20 dark:to-fuchsia-950/10",
          "border border-violet-100/60 dark:border-violet-900/30",
        )}
      >
        <span className="text-sm leading-none shrink-0">🎨</span>
        <span className="text-xs text-violet-700 dark:text-violet-300 font-medium truncate">
          {t("chat.message.toolImageGenerate")}
        </span>
        {images.length > 0 && (
          <span className="ml-auto shrink-0 text-[10px] text-violet-500 dark:text-violet-400">
            {images.length} img
          </span>
        )}
      </div>

      {/* Compact prompt */}
      {prompt && (
        <ToolArgsBlock size="compact" wrap>
          <Sparkles
            size={12}
            className="shrink-0 text-violet-500 dark:text-violet-400"
          />
          <span className="truncate text-violet-600 dark:text-violet-300">
            {prompt.length > 120 ? prompt.slice(0, 117) + "…" : prompt}
          </span>
          <ToolHoverCopyButton text={prompt} position="argsCompact" />
        </ToolArgsBlock>
      )}

      {/* Compact tags */}
      <div className="flex flex-wrap gap-1">
        {images.length > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-violet-100/60 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 text-[10px]">
            {t("chat.message.toolImageCount", { count: images.length })}
          </span>
        )}
        {size && (
          <span className="px-1.5 py-0.5 rounded bg-violet-100/60 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 text-[10px] font-mono">
            {size}
          </span>
        )}
        {quality && (
          <span className="px-1.5 py-0.5 rounded bg-violet-100/60 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 text-[10px] capitalize">
            {quality}
          </span>
        )}
      </div>

      {/* Compact image grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          {images.slice(0, 4).map((img, i) => (
            <div
              key={i}
              className="relative rounded-lg overflow-hidden border border-theme-border hover:border-violet-200 dark:hover:border-violet-800/50 transition-colors cursor-pointer"
              onClick={() => openImagePreview(img.url)}
            >
              <img
                src={img.url}
                alt={img.name}
                className="w-full aspect-square object-cover"
                loading="lazy"
              />
            </div>
          ))}
          {images.length > 4 && (
            <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/50 text-white text-[9px]">
              +{images.length - 4}
            </div>
          )}
        </div>
      )}

      {/* Compact fallback */}
      {fallbackText && (
        <pre className="group/result relative text-xs text-theme-text-tertiary whitespace-pre-wrap break-words overflow-y-auto min-w-0">
          {fallbackText.length > 300
            ? fallbackText.slice(0, 297) + "…"
            : fallbackText}
          <ToolHoverCopyButton text={fallbackText} position="resultCompact" />
        </pre>
      )}
    </ToolInlineDetails>
  );

  return (
    <>
      <CollapsiblePill
        status={status}
        icon={<Sparkles size={12} className="shrink-0 opacity-50" />}
        label={`${t("chat.message.toolImageGenerate")} ${
          prompt.length > 40 ? prompt.slice(0, 37) + "…" : prompt
        }`}
        variant="tool"
        expandable={canExpand}
        onPanelOpen={() => {
          if (!canExpand) return;
          openPersistentToolPanel({
            title: t("chat.message.toolImageGenerate"),
            icon: <Sparkles size={16} />,
            status,
            subtitle:
              prompt.length > 80
                ? prompt.slice(0, 77) + "…"
                : prompt || undefined,
            children: detailContent,
            footer: durationFooter,
          });
        }}
      >
        {compactContent}
      </CollapsiblePill>

      {/* Fallback ImageViewer when session gallery context is unavailable */}
      {imageViewerSrc && (
        <ImageViewer
          src={imageViewerSrc}
          isOpen={!!imageViewerSrc}
          onClose={() => setImageViewerSrc(null)}
        />
      )}
    </>
  );
});

export { ImageGenerateItem };
