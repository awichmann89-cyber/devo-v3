"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";
import { useTabParam } from "@/lib/use-tab-param";

const Tabs = TabsPrimitive.Root;

/**
 * `Tabs` mit dem aktiven Tab in der URL (`?tab=…`) — verlinkbar, Zurück-Button
 * funktioniert, und ein Reload bleibt auf dem Tab, auf dem man gearbeitet hat.
 *
 * Kann aus Server-Komponenten heraus gerendert werden: nur dieser Wrapper ist
 * Client, `TabsContent`-Kinder dürfen serverseitig gerendert bleiben.
 */
export function UrlTabs({
  defaultValue,
  paramKey,
  children,
  ...props
}: Omit<
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>,
  "value" | "onValueChange" | "defaultValue"
> & {
  /** Tab, der ohne `?tab=` aktiv ist. */
  defaultValue: string;
  /** Query-Parameter, falls eine Seite mehrere Tab-Gruppen hat. */
  paramKey?: string;
}) {
  const [value, setValue] = useTabParam(defaultValue, paramKey);
  return (
    <Tabs value={value} onValueChange={setValue} {...props}>
      {children}
    </Tabs>
  );
}

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      // Redesign: Underline-Tabs statt Pill-Container.
      // Auf Mobile horizontal scrollbar, damit viele Tabs nicht umbrechen.
      "flex h-auto w-full max-w-full items-center justify-start gap-0.5 overflow-x-auto rounded-none border-b bg-transparent p-0 text-muted-foreground [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30",
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "-mb-px inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-none border-b-2 border-transparent px-3.5 py-2 text-[13px] font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-primary data-[state=active]:font-bold data-[state=active]:text-foreground",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
