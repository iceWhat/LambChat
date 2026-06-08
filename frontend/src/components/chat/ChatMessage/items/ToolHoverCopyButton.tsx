import { CopyButton } from "../../../common";

type ToolHoverCopyPosition =
  | "args"
  | "argsCompact"
  | "panel"
  | "panelRaised"
  | "panelCompact"
  | "panelCompactRaised"
  | "result"
  | "resultCompact";

const positionClasses: Record<ToolHoverCopyPosition, string> = {
  args: "absolute top-1.5 right-1.5 sm:opacity-0 sm:group-hover/args:opacity-100 transition-opacity",
  argsCompact:
    "absolute top-0.5 right-0.5 sm:opacity-0 sm:group-hover/args:opacity-100 transition-opacity",
  panel:
    "absolute top-2 right-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity",
  panelRaised:
    "absolute top-2 right-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity z-10",
  panelCompact:
    "absolute top-1 right-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity",
  panelCompactRaised:
    "absolute top-1 right-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity z-10",
  result:
    "absolute top-1.5 right-1.5 sm:opacity-0 sm:group-hover/result:opacity-100 transition-opacity",
  resultCompact:
    "absolute top-0.5 right-0.5 sm:opacity-0 sm:group-hover/result:opacity-100 transition-opacity",
};

export function ToolHoverCopyButton({
  text,
  size = 12,
  position,
  copyButtonClassName,
  hidden = false,
}: {
  text: string;
  size?: number;
  position: ToolHoverCopyPosition;
  copyButtonClassName?: string;
  hidden?: boolean;
}) {
  return (
    <div className={positionClasses[position]}>
      {!hidden && (
        <CopyButton text={text} size={size} className={copyButtonClassName} />
      )}
    </div>
  );
}
