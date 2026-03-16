import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/[0.06] focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-b from-[hsl(38_20%42%)] to-[hsl(38_20%32%)] text-white border border-white/[0.06] hover:brightness-110 hover:border-white/[0.12] shadow-md",
        destructive: "bg-gradient-to-b from-[hsl(0_25%28%)] to-[hsl(0_25%18%)] text-white border border-white/[0.06] hover:brightness-110",
        outline: "border border-white/[0.08] bg-transparent hover:bg-white/[0.04] hover:border-white/[0.15] text-foreground",
        secondary: "bg-gradient-to-b from-[hsl(30_3%15%)] to-[hsl(30_3%10%)] text-muted-foreground border border-white/[0.05] hover:bg-white/[0.04]",
        ghost: "hover:bg-white/[0.04] text-muted-foreground hover:text-foreground border border-transparent hover:border-white/[0.05]",
        link: "text-[hsl(38_20%50%)] underline-offset-4 hover:underline",
        gold: "bg-gradient-to-b from-[hsl(38_20%42%)] to-[hsl(38_20%32%)] text-white border border-white/[0.06] hover:brightness-110 hover:border-white/[0.12] shadow-md",
        "gold-outline": "border border-[hsl(38_20%40%)]/40 text-[hsl(38_20%50%)] bg-transparent hover:bg-[hsl(38_20%40%)]/10 hover:border-[hsl(38_20%40%)]/50",
        accent: "bg-gradient-to-b from-[hsl(215_15%32%)] to-[hsl(215_15%22%)] text-white border border-white/[0.06] hover:brightness-110",
        blue: "bg-gradient-to-b from-[hsl(215_15%32%)] to-[hsl(215_15%22%)] text-white border border-white/[0.06] hover:brightness-110 hover:border-white/[0.12]",
        purple: "bg-gradient-to-b from-[hsl(265_12%30%)] to-[hsl(265_12%20%)] text-white border border-white/[0.06] hover:brightness-110 hover:border-white/[0.12]",
        orange: "bg-gradient-to-b from-[hsl(25_18%32%)] to-[hsl(25_18%22%)] text-white border border-white/[0.06] hover:brightness-110 hover:border-white/[0.12]",
        red: "bg-gradient-to-b from-[hsl(0_20%28%)] to-[hsl(0_20%18%)] text-white border border-white/[0.06] hover:brightness-110 hover:border-white/[0.12]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
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
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
