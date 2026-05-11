import { type ReactNode, useMemo, useState } from "react";
import { FolderTree, Code2, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { MessagePart } from "../../../types";
import { getFileTypeInfo } from "../../documents/utils";
import { formatFileSize } from "../../documents/utils/fileSize";
import { openPersistentToolPanel } from "./items/persistentToolPanelState";
import type { RevealPreviewOpenSource } from "./items/revealPreviewState";
import type { RevealPreviewRequest } from "./items/revealPreviewData";
import {
  buildRevealArtifactTree,
  collectRevealArtifacts,
  getRevealArtifactStats,
  type RevealArtifact,
  type RevealArtifactTreeDir,
  type RevealArtifactTreeFile,
} from "./revealArtifacts";

function FolderIcon({
  size = 36,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M54.9632 228.8128c-1.152-21.376 0.64-43.1872 10.0352-62.4128 13.696-28.032 32.2816-45.7728 59.776-57.9072 17.1008-7.552 36.0448-9.344 54.7328-9.344h196.5056a93.696 93.696 0 0 1 59.0592 21.248l38.4512 31.1552a76.8 76.8 0 0 0 48.384 17.152h316.1088c54.1952 0 98.0992 43.5968 98.0992 97.3824l17.792 538.4704c0 53.7856-24.5248 83.456-77.0048 111.3088H184.32c-45.6192-27.8528-70.144-55.6544-98.0992-97.3824L54.9632 228.8128z"
        fill="#FFE8A3"
      />
      <path
        d="M170.1632 310.9632a51.2 51.2 0 0 1 51.2-51.2h601.344a51.2 51.2 0 0 1 51.2 51.2v397.7216a128 128 0 0 1-128 128h-447.744a128 128 0 0 1-128-128V310.9632z"
        fill="#FFCF40"
      />
      <path
        d="M116.736 413.5424a107.9296 107.9296 0 0 1 30.9248-68.1984 92.9792 92.9792 0 0 1 65.536-27.5968H882.176c13.2352 0 26.368 2.944 38.5024 8.6272 12.1344 5.7088 23.0912 14.0288 32.1536 24.4736 9.0368 10.4448 16.0256 22.784 20.48 36.2496 4.48 13.4656 6.3232 27.776 5.4528 42.0608l-24.1152 397.9776a108.1856 108.1856 0 0 1-30.464 69.4784 93.056 93.056 0 0 1-66.176 28.2368h-675.84a90.7264 90.7264 0 0 1-38.912-8.8064c-12.288-5.8368-23.296-14.336-32.384-24.9856a106.5984 106.5984 0 0 1-20.3264-36.9152 112.4352 112.4352 0 0 1-4.864-42.6496l31.0016-397.952z"
        fill="#FFE8A3"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Tree renderer                                                      */
/* ------------------------------------------------------------------ */

function TreeFileRow({
  node,
  depth,
  onOpenPreview,
}: {
  node: RevealArtifactTreeFile;
  depth: number;
  onOpenPreview?: (
    preview: RevealPreviewRequest,
    source?: RevealPreviewOpenSource,
  ) => boolean;
}) {
  const info = getFileTypeInfo(node.artifact.path);
  const Icon = info.icon;
  const sub = node.artifact.fileSize
    ? formatFileSize(node.artifact.fileSize)
    : node.artifact.description;

  return (
    <button
      type="button"
      onClick={() => onOpenPreview?.(node.artifact.preview, "manual")}
      className={clsx(
        "group flex w-full cursor-pointer items-center gap-3 rounded-xl py-2 text-left",
        "border border-transparent transition-all duration-200",
        "hover:border-[var(--theme-border)] hover:bg-[var(--theme-primary-light)]/60",
      )}
      style={{
        paddingLeft: `${12 + depth * 16}px`,
        paddingRight: "12px",
      }}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--theme-bg)] shadow-[inset_0_0_0_1px_var(--theme-border)] dark:shadow-none transition-colors group-hover:bg-[var(--theme-primary-light)]">
        <Icon size={15} className={clsx("shrink-0", info.color)} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[13px] font-medium leading-5 text-[var(--theme-text)]">
          {node.artifact.name}
        </span>
        <span className="mt-0.5 block truncate text-[11px] leading-4 text-[var(--theme-text-secondary)]">
          {sub || node.artifact.path}
        </span>
      </span>
      <ChevronRight
        size={12}
        className="shrink-0 text-[var(--theme-text-secondary)] opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100"
      />
    </button>
  );
}

function TreeDirRow({
  node,
  depth,
  defaultExpanded,
  onOpenPreview,
}: {
  node: RevealArtifactTreeDir;
  depth: number;
  defaultExpanded?: boolean;
  onOpenPreview?: (
    preview: RevealPreviewRequest,
    source?: RevealPreviewOpenSource,
  ) => boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="group flex w-full cursor-pointer items-center gap-3 rounded-xl px-1 py-2.5 text-left transition-colors hover:bg-[var(--theme-primary-light)]"
      >
        <FolderIcon size={36} className="shrink-0" />
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-medium leading-5 text-[var(--theme-text)]">
            {node.name}
          </span>
          <span className="mt-0.5 block truncate text-xs leading-4 text-[var(--theme-text-secondary)]">
            {node.fileCount} {t("chat.message.files", "文件")}
          </span>
        </span>
        <ChevronRight
          size={18}
          className={clsx(
            "shrink-0 text-[var(--theme-text-secondary)] transition-transform duration-200",
            expanded && "rotate-90",
          )}
        />
      </button>
      {expanded &&
        node.children.map((child, i) =>
          child.kind === "dir" ? (
            <TreeDirRow
              key={child.path || `d-${i}`}
              node={child}
              depth={depth + 1}
              defaultExpanded={defaultExpanded}
              onOpenPreview={onOpenPreview}
            />
          ) : (
            <TreeFileRow
              key={child.artifact.id}
              node={child}
              depth={depth + 1}
              onOpenPreview={onOpenPreview}
            />
          ),
        )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Project row (non-file artifacts)                                   */
/* ------------------------------------------------------------------ */

function ProjectRow({
  artifact,
  onOpenPreview,
}: {
  artifact: RevealArtifact & { kind: "project" };
  onOpenPreview?: (
    preview: RevealPreviewRequest,
    source?: RevealPreviewOpenSource,
  ) => boolean;
}) {
  const { t } = useTranslation();
  const Icon = artifact.mode === "folder" ? FolderTree : Code2;
  const subtitle = `${t("project.fileCount", { count: artifact.fileCount })}${
    artifact.mode === "project" && artifact.template !== "static"
      ? ` · ${artifact.template}`
      : ""
  }`;

  return (
    <button
      type="button"
      onClick={() => onOpenPreview?.(artifact.preview, "manual")}
      className="group flex w-full cursor-pointer items-center gap-3 rounded-xl px-1 py-2.5 text-left transition-colors hover:bg-[var(--theme-primary-light)]"
    >
      <span className="flex items-center justify-center size-10 rounded-xl shrink-0 bg-blue-100 dark:bg-blue-900/40 transition-transform duration-200 group-hover:scale-105">
        <Icon
          size={20}
          strokeWidth={1.8}
          className="shrink-0 text-blue-600 dark:text-blue-400"
        />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-medium leading-5 text-[var(--theme-text)]">
          {artifact.name}
        </span>
        <span className="mt-0.5 block truncate text-xs leading-4 text-[var(--theme-text-secondary)]">
          {subtitle}
        </span>
      </span>
      <ChevronRight
        size={18}
        className="shrink-0 text-[var(--theme-text-secondary)] transition-transform duration-200"
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getArtifactSubtitle(
  artifacts: RevealArtifact[],
  t: (key: string, opts?: Record<string, unknown>) => string,
) {
  const { fileCount, projectCount } = getRevealArtifactStats(artifacts);
  if (projectCount > 0 && fileCount > 0) {
    return t("chat.message.artifactsSubtitleMixed", {
      files: fileCount,
      projects: projectCount,
      defaultValue: "{{files}} 个文件 · {{projects}} 个项目",
    });
  }
  if (projectCount > 0) {
    return t("chat.message.artifactsSubtitleProjects", {
      count: projectCount,
      defaultValue: "{{count}} 个项目",
    });
  }
  return t("chat.message.artifactsSubtitleFiles", {
    count: fileCount,
    defaultValue: "{{count}} 个文件",
  });
}

function SectionTitle({
  children,
  count,
}: {
  children: ReactNode;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2.5 px-1 pt-2 pb-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--theme-text-secondary)]">
        {children}
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-[var(--theme-border)]/80 to-transparent" />
      <span className="flex min-w-[20px] items-center justify-center rounded-full bg-[var(--theme-primary)]/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-[var(--theme-primary)]">
        {count}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function RevealArtifactsSummary({
  parts,
  isStreaming,
  onOpenPreview,
}: {
  parts?: MessagePart[];
  isStreaming?: boolean;
  onOpenPreview?: (
    preview: RevealPreviewRequest,
    source?: RevealPreviewOpenSource,
  ) => boolean;
}) {
  const { t } = useTranslation();
  const artifacts = useMemo(() => collectRevealArtifacts(parts), [parts]);
  const subtitle = getArtifactSubtitle(artifacts, t);
  const stats = useMemo(() => getRevealArtifactStats(artifacts), [artifacts]);

  const fileTree = useMemo(
    () =>
      buildRevealArtifactTree(
        artifacts.filter(
          (a): a is RevealArtifact & { kind: "file" } => a.kind === "file",
        ),
      ),
    [artifacts],
  );
  const projects = useMemo(
    () =>
      artifacts.filter(
        (a): a is RevealArtifact & { kind: "project" } => a.kind === "project",
      ),
    [artifacts],
  );

  if (isStreaming || artifacts.length === 0) {
    return null;
  }

  const handleOpenPanel = () => {
    openPersistentToolPanel({
      title: t("chat.message.allFiles", "全部文件"),
      icon: <FolderTree size={16} />,
      status: "idle",
      subtitle,
      panelKey: "reveal-artifacts",
      mobileFillViewport: true,
      children: (
        <div className="flex min-h-full flex-col bg-[var(--theme-bg-card)]">
          <div className="shrink-0 border-b border-[var(--theme-border)] bg-gradient-to-b from-[var(--theme-bg)] to-[var(--theme-bg-card)] px-4 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-medium text-[var(--theme-text-secondary)]">
                {subtitle}
              </span>
              <span className="shrink-0 rounded-md bg-[var(--theme-primary)]/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-[var(--theme-primary)]">
                {stats.totalCount}
              </span>
            </div>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3 scroll-smooth">
            {projects.length > 0 && (
              <section>
                <SectionTitle count={projects.length}>
                  {t("chat.message.projects", "项目")}
                </SectionTitle>
                <div className="space-y-1.5">
                  {projects.map((p) => (
                    <ProjectRow
                      key={p.id}
                      artifact={p}
                      onOpenPreview={onOpenPreview}
                    />
                  ))}
                </div>
              </section>
            )}
            {fileTree.children.length > 0 && (
              <section>
                <SectionTitle count={stats.fileCount}>
                  {t("chat.message.files", "文件")}
                </SectionTitle>
                <div>
                  {fileTree.children.map((child, i) =>
                    child.kind === "dir" ? (
                      <TreeDirRow
                        key={child.path || `d-${i}`}
                        node={child}
                        depth={0}
                        defaultExpanded={false}
                        onOpenPreview={onOpenPreview}
                      />
                    ) : (
                      <TreeFileRow
                        key={child.artifact.id}
                        node={child}
                        depth={0}
                        onOpenPreview={onOpenPreview}
                      />
                    ),
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
      ),
    });
  };

  return (
    <section className="my-2 sm:my-3 min-w-0">
      <div
        role="button"
        tabIndex={0}
        onClick={handleOpenPanel}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleOpenPanel();
          }
        }}
        className="group flex cursor-pointer items-center gap-3 rounded-2xl bg-[var(--theme-bg-card)] px-3 py-2.5 shadow-[0_1px_3px_var(--theme-shadow-sm)] ring-1 ring-[var(--theme-border)] transition-all duration-200 hover:shadow-[0_4px_12px_var(--theme-shadow-md)] hover:ring-[var(--theme-primary)]/30 sm:px-4 sm:py-3"
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--theme-primary-light)] transition-transform duration-200 group-hover:scale-105">
          <FolderIcon size={28} className="shrink-0" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[var(--theme-text)]">
            {t("chat.message.allFiles", "全部文件")}
          </div>
          <div className="mt-0.5 truncate text-xs text-[var(--theme-text-secondary)]">
            {subtitle}
          </div>
        </div>
        <div className="relative z-10 flex shrink-0 items-center gap-1">
          <span className="rounded-lg bg-[var(--theme-primary-light)] px-3 py-1.5 text-xs font-medium text-[var(--theme-primary)] ring-1 ring-[var(--theme-border)] transition-colors group-hover:bg-[var(--theme-primary)] group-hover:text-white group-hover:ring-transparent">
            {t("project.preview", "预览")}
          </span>
        </div>
      </div>
    </section>
  );
}
