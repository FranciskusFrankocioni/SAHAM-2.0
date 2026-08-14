export function formatNumber(n: number): string {
  return new Intl.NumberFormat("id-ID").format(Math.round(n));
}

export function formatCompact(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

export function formatRupiah(n: number): string {
  return `Rp${formatNumber(n)}`;
}

export function formatPercent(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
  });
}

export function formatDateTimeShort(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}
