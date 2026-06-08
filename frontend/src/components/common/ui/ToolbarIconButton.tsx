import type { ButtonHTMLAttributes, ReactNode } from "react";

type ToolbarIconButtonVariant = "stone" | "muted";

export interface ToolbarIconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: ReactNode;
  variant?: ToolbarIconButtonVariant;
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

const variants: Record<ToolbarIconButtonVariant, string> = {
  stone:
    "flex shrink-0 items-center justify-center size-8 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-200/80 dark:hover:bg-stone-700/60 active:bg-stone-200 dark:active:bg-stone-600/60 transition-all duration-200 active:scale-95 cursor-pointer",
  muted:
    "flex shrink-0 items-center justify-center size-8 rounded-xl text-stone-400 dark:text-stone-500 hover:bg-stone-200/80 dark:hover:bg-stone-700/60 active:bg-stone-200 dark:active:bg-stone-600/60 transition-all duration-200 active:scale-95 cursor-pointer",
};

export function ToolbarIconButton({
  icon,
  variant = "stone",
  className,
  onClick,
  type = "button",
  ...props
}: ToolbarIconButtonProps) {
  return (
    <button
      type={type}
      className={cx(variants[variant], className)}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      {...props}
    >
      {icon}
    </button>
  );
}
