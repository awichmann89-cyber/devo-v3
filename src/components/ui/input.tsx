import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Höhenstufen sind an die Tabellen-Dichte gekoppelt — genau wie bei
 * `Button` (icon/iconSm/iconXs) und `SelectTrigger`:
 *   default → Filterleisten, Dialoge, `density="comfortable"`
 *   sm      → `density="compact"`
 *   xs      → `density="dense"` (Zuordnungstabellen im Projekt)
 *
 * Nie per `className="h-7"` nachjustieren — sonst laufen die Stufen wieder
 * auseinander (docs/ui-conventions.md §2).
 */
const inputVariants = cva(
  "flex w-full rounded-md border border-input bg-card ring-offset-background file:border-0 file:bg-transparent file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      inputSize: {
        // 34px = Standard-Controlhöhe (identisch zu Button `size="default"`),
        // damit Inputs, Selects und Buttons in einer Filterzeile fluchten.
        default: "h-[34px] px-3 py-1.5 text-[13px] file:text-sm",
        sm: "h-[30px] px-2.5 py-1 text-xs file:text-xs",
        xs: "h-7 px-2 py-0.5 text-xs file:text-xs",
      },
    },
    defaultVariants: { inputSize: "default" },
  }
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof inputVariants> {
  /** Höhenstufe — an die Tabellen-Dichte gekoppelt. */
  size?: "default" | "sm" | "xs";
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size, inputSize, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(inputVariants({ inputSize: inputSize ?? size }), className)}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input, inputVariants };
