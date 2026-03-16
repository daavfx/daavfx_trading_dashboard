import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-white/[0.04] bg-background px-3 py-2 text-base font-semibold ring-offset-background transition-colors duration-100 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-white/[0.07] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/[0.04] focus-visible:border-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          type === "number" && "value-data text-right",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
