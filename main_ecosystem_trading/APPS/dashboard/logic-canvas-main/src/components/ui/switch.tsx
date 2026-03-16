import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-all duration-150",
      "border-white/[0.06] bg-white/[0.02]",
      "data-[state=checked]:bg-[hsl(215_15%/30%)] data-[state=checked]:border-[hsl(215_15%/30%)]/40",
      "hover:border-white/[0.12] hover:bg-white/[0.04]",
      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/[0.06]",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-3.5 w-3.5 rounded-full shadow-md ring-0 transition-all duration-150",
        "bg-gradient-to-b from-white/70 to-white/50",
        "data-[state=checked]:translate-x-[18px] data-[state=unchecked]:translate-x-[3px]",
        "data-[state=checked]:bg-gradient-to-b data-[state=checked]:from-white/80 data-[state=checked]:to-white/60",
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
