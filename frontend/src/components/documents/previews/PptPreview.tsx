import { memo, useCallback, useEffect, useRef, useState } from "react";
import { FileWarning } from "lucide-react";
import { pptxToHtml } from "@jvmr/pptx-to-html";
import type { TFunction } from "i18next";
import { ViewerToolbar } from "../../common/ViewerToolbar";
import FileFallbackPanel from "./FileFallbackPanel";
import { extractPptxSlideTexts, type PptTextSlide } from "./pptTextPreview";
import { normalizePptxRenderedHtml } from "./pptHtmlPreview";

interface PptPreviewProps {
  url: string;
  arrayBuffer?: ArrayBuffer | null;
  fileName: string;
  t: TFunction;
}

const PPT_PREVIEW_WIDTH = 960;
const PPT_PREVIEW_HEIGHT = 540;
const PPT_VIEWPORT_HORIZONTAL_PADDING = 0;
const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
const SCALE_STEP = 0.2;

const PptPreview = memo(function PptPreview({
  url,
  arrayBuffer,
  fileName,
  t,
}: PptPreviewProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const renderRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [textSlides, setTextSlides] = useState<PptTextSlide[]>([]);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [initialPinchDistance, setInitialPinchDistance] = useState<
    number | null
  >(null);
  const [initialScale, setInitialScale] = useState(1);
  const fitScale =
    viewportWidth > 0
      ? Math.max(
          0.1,
          (viewportWidth - PPT_VIEWPORT_HORIZONTAL_PADDING) / PPT_PREVIEW_WIDTH,
        )
      : 1;

  const zoomIn = useCallback(() => {
    setScale((prev) => Math.min(MAX_SCALE, prev + SCALE_STEP));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prev) => Math.max(MIN_SCALE, prev - SCALE_STEP));
  }, []);

  const resetView = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      setIsDragging(true);
      setDragStart({
        x: event.clientX - position.x,
        y: event.clientY - position.y,
      });
    },
    [position],
  );

  const getPinchDistance = (touches: React.TouchList): number => {
    return Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY,
    );
  };

  const handleTouchStart = useCallback(
    (event: React.TouchEvent) => {
      if (event.touches.length === 1) {
        const touch = event.touches[0];
        setTouchStart({
          x: touch.clientX - position.x,
          y: touch.clientY - position.y,
        });
        setIsDragging(true);
      } else if (event.touches.length === 2) {
        setIsDragging(false);
        setTouchStart(null);
        setInitialPinchDistance(getPinchDistance(event.touches));
        setInitialScale(scale);
      }
    },
    [position, scale],
  );

  const handleTouchMove = useCallback(
    (event: React.TouchEvent) => {
      event.preventDefault();
      if (event.touches.length === 1 && touchStart) {
        const touch = event.touches[0];
        setPosition({
          x: touch.clientX - touchStart.x,
          y: touch.clientY - touchStart.y,
        });
      } else if (event.touches.length === 2 && initialPinchDistance !== null) {
        const nextScale =
          initialScale *
          (getPinchDistance(event.touches) / initialPinchDistance);
        setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale)));
      }
    },
    [initialPinchDistance, initialScale, touchStart],
  );

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    setTouchStart(null);
    setInitialPinchDistance(null);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateViewportWidth = () => setViewportWidth(viewport.clientWidth);
    updateViewportWidth();

    const resizeObserver = new ResizeObserver(updateViewportWidth);
    resizeObserver.observe(viewport);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleNativeWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY > 0 ? -SCALE_STEP : SCALE_STEP;
      setScale((prev) =>
        Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev + delta)),
      );
    };

    viewport.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleNativeWheel);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (event: MouseEvent) => {
      setPosition({
        x: event.clientX - dragStart.x,
        y: event.clientY - dragStart.y,
      });
    };
    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragStart, isDragging]);

  useEffect(() => {
    const renderTarget = renderRef.current;
    if (!renderTarget || !arrayBuffer) {
      setLoading(false);
      setLoadFailed(true);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    setTextSlides([]);
    renderTarget.innerHTML = "";

    pptxToHtml(arrayBuffer.slice(0), {
      width: PPT_PREVIEW_WIDTH,
      height: PPT_PREVIEW_HEIGHT,
      scaleToFit: true,
      letterbox: true,
    })
      .then(async (slidesHtml) => {
        if (cancelled) return;

        if (slidesHtml.length > 0) {
          renderTarget.innerHTML = slidesHtml
            .map(
              (slideHtml) =>
                `<div class="ppt-html-preview-slide">${normalizePptxRenderedHtml(
                  slideHtml,
                )}</div>`,
            )
            .join("");
          setLoading(false);
          return;
        }

        const slides = await extractPptxSlideTexts(arrayBuffer.slice(0));
        if (cancelled) return;
        setTextSlides(slides);
        setLoadFailed(slides.length === 0);
        setLoading(false);
      })
      .catch(async (error) => {
        console.error("Failed to render PPT preview:", error);
        if (cancelled) return;

        try {
          const slides = await extractPptxSlideTexts(arrayBuffer.slice(0));
          if (cancelled) return;
          setTextSlides(slides);
          setLoadFailed(slides.length === 0);
          setLoading(false);
        } catch (fallbackError) {
          console.error("Failed to extract PPT text preview:", fallbackError);
          if (cancelled) return;
          setLoadFailed(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      renderTarget.innerHTML = "";
    };
  }, [arrayBuffer]);

  if (!loading && textSlides.length > 0) {
    return (
      <div className="h-full min-h-[400px] w-full overflow-auto bg-stone-100 px-4 py-5 dark:bg-stone-950 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {textSlides.map((slide) => (
            <section
              key={slide.index}
              className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-black/5 dark:bg-stone-900 dark:ring-white/10"
            >
              <div className="mb-3 text-xs font-medium uppercase tracking-wide text-stone-400 dark:text-stone-500">
                {t("documents.pptSlideLabel", "幻灯片 {{count}}", {
                  count: slide.index,
                })}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-stone-700 dark:text-stone-200">
                {slide.text}
              </p>
            </section>
          ))}
        </div>
      </div>
    );
  }

  if (loadFailed) {
    return (
      <FileFallbackPanel
        icon={FileWarning}
        iconBg="bg-amber-100 dark:bg-amber-900/40"
        iconColor="text-amber-600 dark:text-amber-300"
        title={t("documents.pptPreviewUnavailable", "PPT 预览不可用")}
        description={t(
          "documents.pptPreviewUnavailableHint",
          "当前浏览器无法直接渲染这个演示文稿。旧版 .ppt 或复杂版式可能需要下载后用 PowerPoint、WPS 或 Keynote 打开。",
        )}
        downloadUrl={url}
        fileName={fileName}
        downloadLabel={t("documents.downloadFile")}
      />
    );
  }

  return (
    <div
      ref={viewportRef}
      className="relative h-full min-h-[400px] w-full overflow-hidden bg-stone-200 dark:bg-stone-950"
      aria-label={`PowerPoint - ${fileName}`}
    >
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-stone-100/80 text-sm text-stone-500 dark:bg-stone-950/80 dark:text-stone-400">
          {t("documents.loadingFileContent")}
        </div>
      )}
      <div
        className="absolute top-5 flex flex-col gap-5 pb-28"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          left: "50%",
          width: PPT_PREVIEW_WIDTH,
          cursor: isDragging ? "grabbing" : "grab",
          touchAction: "none",
          transform: `translate(calc(-50% + ${position.x}px), ${
            position.y
          }px) scale(${fitScale * scale})`,
          transformOrigin: "top center",
        }}
      >
        <div ref={renderRef} className="flex flex-col gap-5" />
      </div>
      {!loading && (
        <ViewerToolbar
          scale={scale}
          minScale={MIN_SCALE}
          maxScale={MAX_SCALE}
          showRotation={false}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onRotateLeft={() => {}}
          onRotateRight={() => {}}
          onReset={resetView}
        />
      )}
    </div>
  );
});

export default PptPreview;
