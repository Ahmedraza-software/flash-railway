export function formatRs(amount: number, decimals: number = 2): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `Rs ${n.toFixed(decimals)}`;
}

export function formatRsCompact(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `Rs ${Math.round(n)}`;
}
