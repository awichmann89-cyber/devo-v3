import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Redesign: kompaktere Buttons (34px), 13px semibold, Outline-Buttons
  // reagieren mit Akzentfarbe statt Grau-Hover.
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[13px] font-semibold ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-card text-secondary-foreground hover:border-primary hover:text-primary",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        // Destruktive Zeilen-Aktion (Löschen in Tabellen, Listen, Karten).
        // Immer diese Variante verwenden — nie `text-destructive` per className.
        ghostDestructive:
          "text-destructive hover:bg-destructive-subtle hover:text-destructive",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // 34px = Standard-Controlhöhe (identisch zu Input und SelectTrigger).
        default: "h-[34px] px-3.5",
        sm: "h-[30px] rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-6",
        // Icon-Größen sind an die Tabellen-Dichte gekoppelt:
        //   icon   → density="comfortable"
        //   iconSm → density="compact"
        //   iconXs → density="dense"
        icon: "h-[34px] w-[34px]",
        iconSm: "h-8 w-8",
        iconXs: "h-7 w-7",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
