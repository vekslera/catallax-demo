/** Number formatting. All figures render in monospaced numerals (spec §8). */

const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function fmtInt(x: number): string {
  return int.format(Math.round(x));
}

/** n always shows four decimals — the whole point is that they never change. */
export function fmtN(x: number): string {
  return x.toFixed(4);
}

export function fmtUSD(x: number): string {
  return `$${x.toFixed(2)}`;
}

export function fmtPct(x: number, digits = 0): string {
  return `${(x * 100).toFixed(digits)}%`;
}

/** Signed percentage, for the premium/discount chip. */
export function fmtSignedPct(x: number, digits = 1): string {
  const v = (x * 100).toFixed(digits);
  return `${x > 0 ? '+' : ''}${v}%`;
}
