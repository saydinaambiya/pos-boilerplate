import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils/cn";

interface SectionTabsProps {
  label: string;
  current: string;
  tabs: readonly { id: string; href: string; label: string }[];
}

/** Secondary navigation between sections of one module; scrolls on narrow screens. */
export function SectionTabs({ label, current, tabs }: SectionTabsProps) {
  if (tabs.length < 2) return null;
  return (
    <nav aria-label={label} className="mb-6 max-w-full overflow-x-auto">
      <ul className="inline-flex rounded-full bg-surface-muted p-1">
        {tabs.map((tab) => (
          <li key={tab.id}>
            <Link
              href={tab.href}
              aria-current={tab.id === current ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full px-5 text-sm font-medium whitespace-nowrap text-ink-muted hover:text-ink",
                tab.id === current && "bg-surface text-ink shadow-sm",
              )}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
