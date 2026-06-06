import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Check, Filter } from "lucide-react";
import {
  TYPE_OPTIONS,
  TYPE_DOTS,
  SOURCE_OPTIONS,
  SOURCE_DOTS,
} from "./constants";

export function MemoryFilter({
  typeValue,
  typeOnChange,
  sourceValue,
  sourceOnChange,
}: {
  typeValue: string;
  typeOnChange: (v: string) => void;
  sourceValue: string;
  sourceOnChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const activeType = TYPE_OPTIONS.find((o) => o.value === typeValue);
  const activeSource = SOURCE_OPTIONS.find((o) => o.value === sourceValue);
  const hasFilter = typeValue || sourceValue;

  return (
    <div ref={ref} className="relative shrink-0" data-filter-menu>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="btn-secondary panel-filter-trigger h-10 px-3"
      >
        <Filter size={16} />
        <span className="hidden sm:inline panel-filter-trigger__label">
          {hasFilter
            ? [
                activeType && t(activeType.labelKey),
                activeSource && t(activeSource.labelKey),
              ]
                .filter(Boolean)
                .join(" / ")
            : t("memory.allTypes")}
        </span>
        <ChevronDown
          size={16}
          className={`text-[var(--theme-text-secondary)] transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          className="panel-filter-menu absolute right-0 top-[calc(100%+0.375rem)] z-20 w-44 rounded-xl border py-2 animate-in fade-in-0 zoom-in-95 duration-100"
          role="menu"
        >
          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--theme-text-secondary)]">
            {t("memory.typeLabel")}
          </div>
          {TYPE_OPTIONS.map((opt) => {
            const d = opt.value ? TYPE_DOTS[opt.value] : null;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={typeValue === opt.value}
                onClick={() => typeOnChange(opt.value)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
                  typeValue === opt.value
                    ? "bg-[var(--theme-primary-light)] text-[var(--theme-text)]"
                    : "text-[var(--theme-text-secondary)] hover:bg-[var(--glass-bg)]"
                }`}
              >
                {d && <span className={`h-2 w-2 rounded-full ${d}`} />}
                <span className="flex-1 text-left">{t(opt.labelKey)}</span>
                {typeValue === opt.value && (
                  <Check
                    size={14}
                    className="text-[var(--theme-text-secondary)]"
                  />
                )}
              </button>
            );
          })}
          <div className="my-1 border-t border-[var(--glass-border)]" />
          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--theme-text-secondary)]">
            {t("memory.sourceLabel")}
          </div>
          {SOURCE_OPTIONS.map((opt) => {
            const d = opt.value ? SOURCE_DOTS[opt.value] : null;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={sourceValue === opt.value}
                onClick={() => sourceOnChange(opt.value)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
                  sourceValue === opt.value
                    ? "bg-[var(--theme-primary-light)] text-[var(--theme-text)]"
                    : "text-[var(--theme-text-secondary)] hover:bg-[var(--glass-bg)]"
                }`}
              >
                {d && <span className={`h-2 w-2 rounded-full ${d}`} />}
                <span className="flex-1 text-left">{t(opt.labelKey)}</span>
                {sourceValue === opt.value && (
                  <Check
                    size={14}
                    className="text-[var(--theme-text-secondary)]"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
