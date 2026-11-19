/** Page body: 480px cap, safe-area insets, room for the tab bar when there is one. */
export function Screen({ children, tabs = true, className = "", testId }: { children: React.ReactNode; tabs?: boolean; className?: string; testId?: string }) {
  return (
    <main
      className={`mx-auto flex w-full max-w-[480px] flex-col gap-4 ${className}`}
      data-testid={testId}
      style={{
        minHeight: "100dvh",
        paddingTop: "calc(var(--safe-top) + 12px)",
        paddingLeft: "max(16px, var(--safe-left))",
        paddingRight: "max(16px, var(--safe-right))",
        paddingBottom: tabs ? "calc(var(--tabbar-h) + var(--safe-bottom) + 28px)" : "calc(var(--safe-bottom) + 20px)",
      }}
    >
      {children}
    </main>
  );
}

export function EmptyState({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="pnl grid justify-items-center gap-2 px-5 py-8 text-center">
      <p className="d m-0 text-[26px]">{title}</p>
      <p className="m-0 text-[15px] text-muted">{body}</p>
      {children}
    </div>
  );
}
