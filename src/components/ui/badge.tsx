import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  // Redesign: dezent getönte Flächen mit farbigem Text statt Voll-Farben,
  // eckigere Radien (5px) und kompakte Größe.
  //
  // Kein `max-w`/`truncate` in der Basis — Badges tragen kurze Statuslabels,
  // die vollständig lesbar sein müssen ("Prüfung nicht erforderlich"). Wo eine
  // Spalte wirklich zu eng ist, wird die Kürzung gezielt per className gesetzt.
  "inline-flex shrink-0 items-center gap-1 rounded-[5px] border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary-subtle text-primary",
        secondary: "border-transparent bg-info-subtle text-info",
        destructive: "border-transparent bg-destructive-subtle text-destructive",
        outline: "border-transparent bg-accent text-muted-foreground",
        success: "border-transparent bg-success-subtle text-success",
        warning: "border-transparent bg-warning-subtle text-warning",
        info: "border-transparent bg-info-subtle text-info",
        subhire: "border-transparent bg-subhire-subtle text-subhire",
      },
      size: {
        // Standard — Status in Detailansichten, Headern und Tabellen der
        // Dichte `comfortable`.
        default: "px-2 py-0.5 text-[11px]",
        // Kompakt — nur in Tabellen der Dichte `compact` / `dense`.
        sm: "px-1.5 py-0.5 text-[10px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  /** Rendert das Badge als Kind-Element (z.B. `<button>` für Toggle-Badges). */
  asChild?: boolean;
}

function Badge({ className, variant, size, asChild, children, ...props }: BadgeProps) {
  const classes = cn(badgeVariants({ variant, size }), className);
  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<{ className?: string }>;
    return React.cloneElement(child, {
      className: cn(classes, child.props.className),
    });
  }
  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}

export { Badge, badgeVariants };
