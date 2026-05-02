import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
        secondary:
          "border-slate-200/50 bg-slate-50 text-slate-700 hover:bg-slate-100/80",
        destructive:
          "border-red-200/50 bg-red-50 text-red-700 hover:bg-red-50/90",
        outline: "border-slate-200/50 bg-white text-slate-700",
        success: "border-emerald-200/50 bg-emerald-50 text-emerald-700",
        amber: "border-amber-200/50 bg-amber-50 text-amber-700",
        muted: "border-slate-200/50 bg-slate-50 text-slate-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
