import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { notificationApi } from "../../services/api/notification";
import { surfaceAppAnnouncementNotifications } from "../../services/notifications/announcementNotifications";
import type { Notification } from "../../types/notification";

const AUTO_PLAY_INTERVAL = 5000;

/** A compact auto-playing notification card pinned to the welcome page bottom. */
export function NotificationBanner() {
  const { t, i18n } = useTranslation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState<
    "left" | "right" | "none"
  >("none");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lang = (i18n.language?.split("-")[0] ||
    "en") as keyof Notification["title_i18n"];

  // ── Fetch notifications ──────────────────────────────────────────
  useEffect(() => {
    notificationApi.getActive().then((items) => {
      setNotifications(items);
      surfaceAppAnnouncementNotifications(items, lang);
    });
  }, [i18n.language, lang]);

  const visible = notifications.filter((n) => !dismissedIds.has(n.id));

  // ── Auto-play timer ───────────────────────────────────────────────
  const resetTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (visible.length > 1) {
      timerRef.current = setInterval(() => {
        setSlideDirection("left");
        setCurrentIndex((i) => (i + 1) % visible.length);
      }, AUTO_PLAY_INTERVAL);
    }
  }, [visible.length]);

  useEffect(() => {
    resetTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [resetTimer]);

  // Keep index in bounds when visible changes
  useEffect(() => {
    if (visible.length === 0) setCurrentIndex(0);
    else if (currentIndex >= visible.length) setCurrentIndex(0);
  }, [visible.length, currentIndex]);

  const goTo = useCallback(
    (index: number) => {
      if (index === currentIndex) return;
      setSlideDirection(index > currentIndex ? "left" : "right");
      setCurrentIndex(index);
      resetTimer();
    },
    [currentIndex, resetTimer],
  );

  const handleDismiss = useCallback(async (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
    try {
      await notificationApi.dismiss(id);
    } catch {
      // silently fail
    }
  }, []);

  // ── Touch swipe support ───────────────────────────────────────────
  const touchStartX = useRef(0);
  const SWIPE_THRESHOLD = 40;

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (visible.length <= 1) return;
      const delta = e.changedTouches[0].clientX - touchStartX.current;
      if (Math.abs(delta) < SWIPE_THRESHOLD) return;
      if (delta < 0) {
        // swipe left → next
        goTo((currentIndex + 1) % visible.length);
      } else {
        // swipe right → prev
        goTo((currentIndex - 1 + visible.length) % visible.length);
      }
    },
    [visible.length, currentIndex, goTo],
  );

  if (visible.length === 0) return null;

  const current = visible[currentIndex];
  const title = current.title_i18n[lang] || current.title_i18n.en;
  const content = current.content_i18n[lang] || current.content_i18n.en;

  const slideIn =
    slideDirection === "left"
      ? "notification-slide-in-left"
      : slideDirection === "right"
        ? "notification-slide-in-right"
        : "notification-fade-in";

  return (
    <div className="absolute bottom-4 sm:bottom-6 left-0 right-0 flex justify-center px-[20px] z-0 pointer-events-none">
      <div className="w-full sm:max-w-[44rem] md:max-w-[46rem] lg:max-w-[48rem] xl:max-w-[50rem] 2xl:max-w-[52rem] flex flex-col items-center pointer-events-auto">
        {/* Card */}
        <div className="relative group max-w-full">
          {/* Close button — top-right, visible on hover */}
          <button
            onClick={() => handleDismiss(current.id)}
            className="notification-dismiss-btn absolute top-[-11px] end-[-6px] z-10 size-5 flex items-center justify-center rounded-full invisible group-hover:visible hover:opacity-80 cursor-pointer transition-opacity duration-200"
            style={{
              backgroundColor:
                "var(--theme-text-tertiary, var(--theme-text-secondary))",
            }}
            aria-label={t("notification.dismiss", "关闭")}
          >
            <X size={14} style={{ color: "#fff" }} />
          </button>

          {/* Content area — slides in/out */}
          <div
            className={`notification-content w-[540px] max-w-full rounded-xl border cursor-pointer transition-all duration-200 ${slideIn}`}
            style={{
              backgroundColor: "var(--theme-bg-card)",
              borderColor: "var(--theme-border)",
              boxShadow:
                "0 1px 3px color-mix(in srgb, var(--theme-text) 6%, transparent), 0 0 0 0.5px color-mix(in srgb, var(--theme-border) 50%, transparent)",
            }}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <div className="flex items-center gap-2 px-4 py-3">
              <div className="flex flex-col gap-1 min-w-0">
                <p
                  className="text-sm sm:text-[15px] font-semibold leading-[20px] truncate tracking-[-0.01em]"
                  style={{ color: "var(--theme-text)" }}
                  title={title}
                >
                  {title}
                </p>
                {content && (
                  <p
                    className="text-xs sm:text-[13px] leading-[18px] line-clamp-1"
                    style={{ color: "var(--theme-text-secondary)" }}
                  >
                    {content}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Dot indicators — always reserve space to prevent layout shift */}
        <div className="h-[14px] flex items-center justify-center gap-2 mt-2">
          {visible.length > 1 &&
            visible.map((n, i) => (
              <button
                key={n.id}
                onClick={() => goTo(i)}
                className="notification-dot size-2 rounded-full transition-all duration-300 cursor-pointer"
                style={{
                  backgroundColor:
                    i === currentIndex
                      ? "var(--theme-text-secondary)"
                      : "var(--theme-border)",
                }}
                aria-label={`Notification ${i + 1}`}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
