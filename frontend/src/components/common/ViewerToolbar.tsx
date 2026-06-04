import { ZoomIn, ZoomOut, RotateCcw, RotateCw, Shrink } from "lucide-react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";

interface ViewerToolbarProps {
  scale: number;
  minScale?: number;
  maxScale?: number;
  scaleStep?: number;
  showRotation?: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onReset: () => void;
  className?: string;
}

export function ViewerToolbar({
  scale,
  minScale = 0.1,
  maxScale = 20,
  showRotation = true,
  onZoomIn,
  onZoomOut,
  onRotateLeft,
  onRotateRight,
  onReset,
  className,
}: ViewerToolbarProps) {
  const { t } = useTranslation();
  const scalePercentage = Math.round(scale * 100);

  return (
    <div
      className={clsx(
        "absolute bottom-[calc(1rem+var(--app-safe-area-bottom,0px))] sm:bottom-[calc(2rem+var(--app-safe-area-bottom,0px))] left-1/2 -translate-x-1/2 flex items-center gap-0.5 sm:gap-1 rounded-2xl bg-black/70 px-1.5 sm:px-2 py-1.5 sm:py-2",
        className,
      )}
    >
      {showRotation && (
        <>
          <div className="flex items-center rounded-xl hover:bg-white/5 transition-colors">
            <button
              type="button"
              onClick={onRotateLeft}
              className="flex items-center justify-center size-8 rounded-lg hover:bg-white/10 transition-colors cursor-pointer text-white/70"
              aria-label={t("imageViewer.rotateLeft")}
              title={t("imageViewer.rotateLeft")}
            >
              <RotateCcw size={18} />
            </button>

            <button
              type="button"
              onClick={onRotateRight}
              className="flex items-center justify-center size-8 rounded-lg hover:bg-white/10 transition-colors cursor-pointer text-white/70"
              aria-label={t("imageViewer.rotateRight")}
              title={t("imageViewer.rotateRight")}
            >
              <RotateCw size={18} />
            </button>
          </div>

          <div className="w-px h-5 sm:h-6 bg-white/20 mx-0.5 sm:mx-1" />
        </>
      )}

      <div className="flex items-center rounded-xl hover:bg-white/5 transition-colors">
        <button
          type="button"
          onClick={onZoomOut}
          disabled={scale <= minScale}
          className="flex items-center justify-center size-8 rounded-lg hover:bg-white/10 transition-colors cursor-pointer text-white/70 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={t("imageViewer.zoomOut")}
          title={t("imageViewer.zoomOut")}
        >
          <ZoomOut size={18} />
        </button>

        <span className="min-w-[48px] sm:min-w-[52px] text-center text-white/70 text-xs sm:text-sm font-medium tabular-nums">
          {scalePercentage}%
        </span>

        <button
          type="button"
          onClick={onZoomIn}
          disabled={scale >= maxScale}
          className="flex items-center justify-center size-8 rounded-lg hover:bg-white/10 transition-colors cursor-pointer text-white/70 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={t("imageViewer.zoomIn")}
          title={t("imageViewer.zoomIn")}
        >
          <ZoomIn size={18} />
        </button>
      </div>

      <div className="w-px h-5 sm:h-6 bg-white/20 mx-0.5 sm:mx-1" />

      <div className="flex items-center rounded-xl hover:bg-white/5 transition-colors">
        <button
          type="button"
          onClick={onReset}
          className="flex items-center justify-center size-8 rounded-lg hover:bg-white/10 transition-colors cursor-pointer text-white/70"
          aria-label={t("imageViewer.reset")}
          title={t("imageViewer.reset")}
        >
          <Shrink size={18} />
        </button>
      </div>
    </div>
  );
}
