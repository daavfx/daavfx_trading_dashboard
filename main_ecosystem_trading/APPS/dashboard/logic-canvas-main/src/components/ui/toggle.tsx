import * as React from "react";
import * as TogglePrimitive from "@radix-ui/react-toggle";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const toggleVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors duration-100 hover:bg-white/[0.03] hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/[0.06] disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-white/[0.04] data-[state=on]:text-foreground",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border border-white/[0.05] bg-transparent hover:bg-white/[0.03] hover:text-foreground",
      },
      size: {
        default: "h-10 px-3",
        sm: "h-9 px-2.5",
        lg: "h-11 px-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const Toggle = React.forwardRef<
  React.ElementRef<typeof TogglePrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>
>(({ className, variant, size, ...props }, ref) => (
  <TogglePrimitive.Root ref={ref} className={cn(toggleVariants({ variant, size, className }))} {...props} />
));

Toggle.displayName = TogglePrimitive.Root.displayName;

export { Toggle, toggleVariants };
