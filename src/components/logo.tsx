import Image from "next/image";
import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface LogoProps {
  size?: "sm" | "md" | "lg"
  showText?: boolean
  className?: string
}

const sizeClasses = {
  sm: "w-8 h-8;",
  md: "w-12 h-12;",
  lg: "w-16 h-16;",
};

const textSizeClasses = {
  sm: "text-lg;",
  md: "text-xl;",
  lg: "text-2xl;",
};

export const Logo = forwardRef<HTMLHeadingElement, LogoProps>(({ size = "md", showText = true, className }, ref) => {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="relative">
        <Image
          src="/icon.svg"
          alt="Logo Administration Email"
          width={size === "sm" ? 32 : size === "md" ? 48 : 64}
          height={size === "sm" ? 32 : size === "md" ? 48 : 64}
          className={cn(sizeClasses[size], "drop-shadow-sm")}
          priority
        />
      </div>
      {showText && (
        <div className="flex flex-col">
          <h1 ref={ref} className={cn("font-semibold text-gray-900 leading-tight", textSizeClasses[size])}>
            Administration Email
          </h1>
          {size !== "sm" && <p className="text-sm text-gray-600 leading-tight">Gestion des redirections</p>}
        </div>
      )}
    </div>
  );
});

Logo.displayName = "Logo";
