import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-all duration-100",
      "border-white/[0.06] data-[state=unchecked]:bg-white/[0.015]",
      "data-[state=checked]:bg-primary/25 data-[state=checked]:border-primary/20",
      "hover:border-white/[0.10]",
      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/[0.05]",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-3.5 w-3.5 rounded-full shadow-sm ring-0 transition-all duration-100",
        "bg-white/60 data-[state=checked]:bg-white/75",
        "data-[state=checked]:translate-x-[18px] data-[state=unchecked]:translate-x-[3px]",
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
