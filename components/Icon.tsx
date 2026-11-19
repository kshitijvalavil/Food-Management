import { SPRITE_SYMBOLS, type SymbolId } from "./sprite-symbols";

/** Hidden <svg> with every <symbol>; rendered once in the root layout. */
export function Sprite() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
      dangerouslySetInnerHTML={{ __html: SPRITE_SYMBOLS }}
    />
  );
}

export type IconName = Extract<SymbolId, `i-${string}`>;

/** Decorative stroke icon. Give the surrounding control its accessible name. */
export function Icon({ name, className = "", style }: { name: IconName; className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={`i ${className}`} aria-hidden="true" focusable="false" style={style}>
      <use href={`#${name}`} />
    </svg>
  );
}

export function Logo({ className = "", size = 32 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden="true" focusable="false">
      <use href="#logo" />
    </svg>
  );
}

/** App-icon tile: the logo on indigo, as in the mockups. */
export function AppMark({ size = 56 }: { size?: number }) {
  return (
    <span
      className="inline-grid place-items-center bg-indigo"
      style={{ width: size, height: size, borderRadius: size * 0.24, background: "#2e31a0" }}
      aria-hidden="true"
    >
      <Logo size={Math.round(size * 0.72)} />
    </span>
  );
}
