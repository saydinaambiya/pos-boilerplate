/** Bare frame for printable documents: no navigation, paper centred on screen. */
export default function PrintLayout({ children }: LayoutProps<"/[locale]">) {
  return (
    <main id="main" className="min-h-dvh bg-surface-muted py-6 print:bg-white print:py-0">
      {children}
    </main>
  );
}
