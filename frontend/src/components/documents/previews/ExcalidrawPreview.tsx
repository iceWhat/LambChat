import { memo, useEffect, useMemo, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { LoadingSpinner } from "../../common/LoadingSpinner";
import { ViewerToolbar } from "../../common/ViewerToolbar";
import { AlertCircle, Check, Copy, Download, Maximize2, X } from "lucide-react";
import { copyToClipboard } from "../../../utils/clipboard";

// Types for Excalidraw
interface ExcalidrawElement {
  id: string;
  [key: string]: unknown;
}

interface ExcalidrawAppState {
  viewBackgroundColor?: string;
  [key: string]: unknown;
}

interface ExcalidrawPreviewProps {
  data: string; // JSON string of excalidraw file content
}

// Cache for the export function
let exportToSvgFunc:
  | ((opts: {
      elements: readonly ExcalidrawElement[];
      appState?: ExcalidrawAppState;
    }) => Promise<SVGSVGElement>)
  | null = null;

const ExcalidrawPreview = memo(function ExcalidrawPreview({
  data,
}: ExcalidrawPreviewProps) {
  const { t } = useTranslation();
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopySvg = useCallback(() => {
    if (!svgContent) return;
    copyToClipboard(svgContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [svgContent]);

  // Touch zoom state
  const [touchStart, setTouchStart] = useState<{
    x: number;
    y: number;
    distance: number;
  } | null>(null);

  // Drag to pan state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [translate, setTranslate] = useState({ x: 0, y: 0 });

  // Parse excalidraw data
  const parseData = useCallback((rawData: string) => {
    if (!rawData) return null;

    try {
      const parsed = JSON.parse(rawData);
      const elements = parsed.elements || parsed;
      const appState = parsed.appState || {};

      if (!Array.isArray(elements)) {
        return null;
      }

      return {
        elements: elements as ExcalidrawElement[],
        appState: {
          ...appState,
          viewBackgroundColor: appState.viewBackgroundColor || "#ffffff",
        },
      };
    } catch (err) {
      console.error("Failed to parse Excalidraw data:", err);
      return null;
    }
  }, []);

  // Load export function and render SVG
  useEffect(() => {
    if (!data) {
      setIsLoading(false);
      return;
    }

    const parsed = parseData(data);
    if (!parsed) {
      setError(t("documents.invalidExcalidrawFormat"));
      setIsLoading(false);
      return;
    }

    const renderSvg = async () => {
      try {
        // Load exportToSvg function once
        if (!exportToSvgFunc) {
          const mod = await import("@excalidraw/excalidraw");
          exportToSvgFunc = mod.exportToSvg;
        }

        // Use local reference to satisfy TypeScript
        const exportFn = exportToSvgFunc;
        if (!exportFn) {
          throw new Error(t("documents.excalidrawExportFailed"));
        }

        const svg = await exportFn({
          elements: parsed.elements,
          appState: { ...parsed.appState, exportWithDarkMode: false },
        });

        // Serialize SVG to string
        const svgString = new XMLSerializer().serializeToString(svg);
        setSvgContent(svgString);
        setError(null);
      } catch (err) {
        console.error("Failed to render Excalidraw:", err);
        setError(t("documents.excalidrawRenderFailed"));
      } finally {
        setIsLoading(false);
      }
    };

    renderSvg();
  }, [data, parseData, t]);

  // Wheel zoom
  const handleWheel = useCallback((event: React.WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;

    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    setScale((prev) => Math.min(Math.max(prev + delta, 0.1), 5));
  }, []);

  // Touch zoom handlers
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        setTouchStart({
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
          distance: Math.sqrt(dx * dx + dy * dy),
        });
      } else if (e.touches.length === 1) {
        // Single touch for panning
        setIsDragging(true);
        setDragStart({
          x: e.touches[0].clientX - translate.x,
          y: e.touches[0].clientY - translate.y,
        });
      }
    },
    [translate],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2 && touchStart) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const delta = (distance - touchStart.distance) / 200;
        setScale((prev) => Math.min(Math.max(prev + delta, 0.1), 5));
        setTouchStart({ ...touchStart, distance });
      } else if (e.touches.length === 1 && isDragging) {
        e.preventDefault();
        setTranslate({
          x: e.touches[0].clientX - dragStart.x,
          y: e.touches[0].clientY - dragStart.y,
        });
      }
    },
    [touchStart, isDragging, dragStart],
  );

  const handleTouchEnd = useCallback(() => {
    setTouchStart(null);
    setIsDragging(false);
  }, []);

  // Mouse drag handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      setIsDragging(true);
      setDragStart({ x: e.clientX - translate.x, y: e.clientY - translate.y });
    },
    [translate],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setTranslate({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    },
    [isDragging, dragStart],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Download handlers
  const handleDownloadSVG = () => {
    if (!svgContent) return;

    const blob = new Blob([svgContent], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "excalidraw-diagram.svg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPNG = async () => {
    if (!svgContent) return;

    try {
      const img = new Image();
      const svgBlob = new Blob([svgContent], { type: "image/svg+xml" });
      const url = URL.createObjectURL(svgBlob);

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = url;
      });

      const canvas = document.createElement("canvas");
      const renderScale = 2;
      canvas.width = img.width * renderScale;
      canvas.height = img.height * renderScale;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(renderScale, renderScale);
        ctx.drawImage(img, 0, 0);
      }

      canvas.toBlob((blob) => {
        if (blob) {
          const pngUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = pngUrl;
          a.download = "excalidraw-diagram.png";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(pngUrl);
        }
      }, "image/png");

      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export PNG:", err);
    }
  };

  // Download dropdown state
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDownloadMenu) return;
    const handleClickOutside = () => setShowDownloadMenu(false);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showDownloadMenu]);

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/30">
          <AlertCircle size={28} className="text-red-500" />
        </div>
        <div className="text-center">
          <p className="text-sm text-red-600 dark:text-red-400 font-medium mb-2">
            {error}
          </p>
          <p className="text-xs text-stone-400 dark:text-stone-500">
            The file may be corrupted or in an unsupported format.
          </p>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <LoadingSpinner size="lg" />
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Loading diagram...
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 bg-stone-200/70 dark:bg-stone-800/50 shrink-0">
        <span className="text-xs font-medium text-stone-500 dark:text-stone-400">
          excalidraw
        </span>
        <div className="flex items-center gap-1">
          {/* Copy */}
          <button
            onClick={handleCopySvg}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all min-h-[32px] min-w-[32px] touch-manipulation"
            title={copied ? t("chat.message.copied") : t("chat.message.copy")}
          >
            {copied ? (
              <>
                <Check
                  size={14}
                  className="text-green-600 dark:text-green-400"
                />
                <span className="hidden xs:inline text-green-600 dark:text-green-400">
                  {t("chat.message.copied")}
                </span>
              </>
            ) : (
              <>
                <Copy
                  size={14}
                  className="text-stone-500 dark:text-stone-400"
                />
                <span className="hidden xs:inline text-stone-500 dark:text-stone-400">
                  {t("chat.message.copy")}
                </span>
              </>
            )}
          </button>
          {/* Download dropdown */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDownloadMenu(!showDownloadMenu);
              }}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all hover:bg-stone-300/50 dark:hover:bg-stone-700/50 min-h-[32px] min-w-[32px] touch-manipulation"
              title={t("documents.download")}
            >
              <Download
                size={14}
                className="text-stone-500 dark:text-stone-400"
              />
            </button>
            {showDownloadMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[100px] rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 shadow-lg overflow-hidden">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownloadSVG();
                    setShowDownloadMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 flex items-center gap-2"
                >
                  SVG
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownloadPNG();
                    setShowDownloadMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 flex items-center gap-2"
                >
                  PNG
                </button>
              </div>
            )}
          </div>
          {/* Fullscreen */}
          <button
            onClick={() => setIsFullscreen(true)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all hover:bg-stone-300/50 dark:hover:bg-stone-700/50 min-h-[32px] min-w-[32px] touch-manipulation"
            title={t("imageViewer.fullscreen", "Fullscreen")}
          >
            <Maximize2
              size={14}
              className="text-stone-500 dark:text-stone-400"
            />
          </button>
        </div>
      </div>

      {/* SVG Container with touch and drag support */}
      <div
        ref={containerRef}
        className={`flex-1 overflow-hidden bg-white dark:bg-stone-900 flex items-center justify-center ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {svgContent ? (
          <div
            style={{
              transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
              transformOrigin: "center center",
              transition: isDragging ? "none" : "transform 0.2s ease-out",
            }}
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        ) : (
          <p className="text-stone-400 dark:text-stone-500">
            {t("documents.noContent", "无内容")}
          </p>
        )}
      </div>

      {/* Fullscreen viewer */}
      {isFullscreen && svgContent && (
        <ExcalidrawFullscreenViewer
          svgContent={svgContent}
          onClose={() => setIsFullscreen(false)}
        />
      )}
    </div>
  );
});

// Fullscreen viewer for excalidraw diagrams (matches ImageViewer/MermaidViewer pattern)
function ExcalidrawFullscreenViewer({
  svgContent,
  onClose,
}: {
  svgContent: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const MIN_SCALE = 0.1;
  const MAX_SCALE = 20;
  const SCALE_STEP = 0.25;

  // Ref to read current position/scale inside native event listeners
  const gestureStateRef = useRef({ position: { x: 0, y: 0 }, scale: 1 });
  gestureStateRef.current = { position, scale };

  // Render SVG as <img> via blob URL for GPU-accelerated transforms
  const svgBlobUrl = useMemo(() => {
    const blob = new Blob([svgContent], { type: "image/svg+xml" });
    return URL.createObjectURL(blob);
  }, [svgContent]);

  useEffect(() => {
    return () => URL.revokeObjectURL(svgBlobUrl);
  }, [svgBlobUrl]);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Native non-passive wheel handler — no ctrlKey required (matches ImageViewer)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY > 0 ? -SCALE_STEP : SCALE_STEP;
      setScale((prev) =>
        Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev + delta)),
      );
    };

    container.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleNativeWheel);
    };
  }, []);

  // Mouse drag to pan
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    },
    [position],
  );

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    };
    const handleMouseUp = () => setIsDragging(false);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragStart]);

  // Native non-passive touch listeners (pinch zoom + pan)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let ts: { x: number; y: number } | null = null;
    let pinchDist: number | null = null;
    let pinchScale = 1;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const pos = gestureStateRef.current.position;
        ts = { x: touch.clientX - pos.x, y: touch.clientY - pos.y };
        setIsDragging(true);
      } else if (e.touches.length === 2) {
        setIsDragging(false);
        ts = null;
        pinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        pinchScale = gestureStateRef.current.scale;
      }
    };

    const onMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1 && ts) {
        const touch = e.touches[0];
        setPosition({
          x: touch.clientX - ts.x,
          y: touch.clientY - ts.y,
        });
      } else if (e.touches.length === 2 && pinchDist !== null) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        const sf = dist / pinchDist;
        setScale(() =>
          Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchScale * sf)),
        );
      }
    };

    const onEnd = () => {
      setIsDragging(false);
      ts = null;
      pinchDist = null;
    };

    container.addEventListener("touchstart", onStart, { passive: true });
    container.addEventListener("touchmove", onMove, { passive: false });
    container.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      container.removeEventListener("touchstart", onStart);
      container.removeEventListener("touchmove", onMove);
      container.removeEventListener("touchend", onEnd);
    };
  }, []);

  // Download handlers for fullscreen top bar
  const handleDownloadSVG = () => {
    const blob = new Blob([svgContent], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "excalidraw-diagram.svg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPNG = async () => {
    try {
      const img = new Image();
      const svgBlob = new Blob([svgContent], { type: "image/svg+xml" });
      const url = URL.createObjectURL(svgBlob);

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = url;
      });

      const canvas = document.createElement("canvas");
      const renderScale = 2;
      canvas.width = img.width * renderScale;
      canvas.height = img.height * renderScale;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(renderScale, renderScale);
        ctx.drawImage(img, 0, 0);
      }

      canvas.toBlob((blob) => {
        if (blob) {
          const pngUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = pngUrl;
          a.download = "excalidraw-diagram.png";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(pngUrl);
        }
      }, "image/png");

      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export PNG:", err);
    }
  };

  const handleBackgroundClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const btnCls =
    "flex items-center justify-center w-10 h-10 rounded-lg hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

  return createPortal(
    <div
      data-yields-sidebar
      className="fixed inset-0 z-[300] flex flex-col bg-black/90"
      onClick={handleBackgroundClick}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 sm:px-6 py-3 bg-black">
        <button
          type="button"
          onClick={onClose}
          className={btnCls}
          aria-label={t("common.close")}
        >
          <X size={20} className="text-white/70" />
        </button>

        <div className="flex items-center gap-1">
          {/* Download SVG */}
          <button
            type="button"
            onClick={handleDownloadSVG}
            className="flex items-center gap-1.5 rounded-lg px-3 h-10 text-sm font-medium transition-colors cursor-pointer hover:bg-white/10 text-white/70"
            aria-label={`${t("documents.download")} SVG`}
          >
            <Download size={18} className="text-white/70" />
            <span className="hidden sm:inline">SVG</span>
          </button>

          {/* Download PNG */}
          <button
            type="button"
            onClick={handleDownloadPNG}
            className="flex items-center gap-1.5 rounded-lg px-3 h-10 text-sm font-medium transition-colors cursor-pointer hover:bg-white/10 text-white/70"
            aria-label={`${t("documents.download")} PNG`}
          >
            <Download size={18} className="text-white/70" />
            <span className="hidden sm:inline">PNG</span>
          </button>
        </div>
      </div>

      {/* Main area */}
      <div ref={containerRef} className="flex-1 overflow-hidden relative">
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            cursor: scale > 1 ? (isDragging ? "grabbing" : "grab") : "default",
          }}
          onMouseDown={handleMouseDown}
        >
          <img
            src={svgBlobUrl}
            alt={t("documents.excalidrawDiagram", "Excalidraw diagram")}
            className="max-w-[90vw] max-h-[85dvh] object-contain select-none"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
              transition: isDragging ? "none" : "transform 0.1s ease-out",
              touchAction: "none",
            }}
            draggable={false}
          />
        </div>

        {/* Floating bottom controls — shared ViewerToolbar */}
        <ViewerToolbar
          scale={scale}
          minScale={MIN_SCALE}
          maxScale={MAX_SCALE}
          onZoomIn={() =>
            setScale((prev) => Math.min(MAX_SCALE, prev + SCALE_STEP))
          }
          onZoomOut={() =>
            setScale((prev) => Math.max(MIN_SCALE, prev - SCALE_STEP))
          }
          onRotateLeft={() => setRotation((prev) => prev - 90)}
          onRotateRight={() => setRotation((prev) => prev + 90)}
          onReset={() => {
            setScale(1);
            setRotation(0);
            setPosition({ x: 0, y: 0 });
          }}
        />
      </div>
    </div>,
    document.body,
  );
}

export default ExcalidrawPreview;
