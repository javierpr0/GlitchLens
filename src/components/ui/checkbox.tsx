"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

function Checkbox({
  className,
  ...props
}: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border border-border bg-background transition-colors focus-visible:ring-2 focus-visible:ring-ring data-[checked]:bg-primary data-[checked]:border-primary data-[indeterminate]:bg-primary data-[indeterminate]:border-primary disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        className="text-primary-foreground"
        render={(props, state) => (
          <span {...props}>
            {state.indeterminate ? (
              <Minus className="h-3 w-3" strokeWidth={3} />
            ) : (
              <Check className="h-3 w-3" strokeWidth={3} />
            )}
          </span>
        )}
      />
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
