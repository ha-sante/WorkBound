import { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

type variant = "default" | "ghost";

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  variant?: variant;
  full_width?: boolean;
  wrapper_class?: string;
};

const variant_classes: Record<variant, string> = {
  default:
    "text-sm px-3 pr-8 py-1 border border-border-subtle rounded bg-white outline-none cursor-pointer text-gray-800",
  ghost: "text-sm bg-transparent pr-6 outline-none cursor-pointer",
};

export function Select({ variant = "default", full_width = true, wrapper_class = "", className = "", children, ...rest }: Props) {
  return (
    <div className={`relative inline-flex items-center ${full_width ? "w-full" : ""} ${wrapper_class}`}>
      <select
        {...rest}
        className={`appearance-none ${variant_classes[variant]} ${full_width ? "w-full" : ""} ${className}`}>
        {children}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary shrink-0"
      />
    </div>
  );
}