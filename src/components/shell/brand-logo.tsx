import { appConfig } from "@/config/app.config";
import { cn } from "@/lib/utils/cn";

const { appName, logo } = appConfig.brand;

interface BrandLogoProps {
  /** `mark` uses the square app icon, for narrow spaces like the compact rail. */
  variant?: "full" | "mark";
  className?: string;
}

/**
 * Logos are static files under public/brand (PRD FR-SET-02). Plain `<img>`
 * is used on purpose: SVG logos gain nothing from image optimization.
 */
export function BrandLogo({ variant = "full", className }: BrandLogoProps) {
  if (variant === "mark") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- see component docs
      <img src={logo.icon} alt={appName} className={cn("size-10 rounded-full", className)} />
    );
  }

  const dark = logo.dark ?? logo.light;

  return (
    <span className={cn("inline-flex h-10 items-center", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- see component docs */}
      <img src={logo.light} alt={appName} className="h-full w-auto theme-dark:hidden" />
      {dark !== logo.light ? (
        // eslint-disable-next-line @next/next/no-img-element -- see component docs
        <img src={dark} alt={appName} className="hidden h-full w-auto theme-dark:block" />
      ) : null}
    </span>
  );
}
