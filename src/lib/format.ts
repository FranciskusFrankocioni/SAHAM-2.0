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

/**
 * Formats a plain "YYYY-MM-DD" trading date by splitting the string, not by
 * constructing a `Date` and letting the runtime reinterpret it in a
 * timezone — that path can shift the displayed day by one depending on the
 * host's local timezone, which is exactly the kind of off-by-one this
 * value must never have.
 */
export function formatTradingDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
  ];
  return `${String(day).padStart(2, "0")} ${monthNames[month - 1]} ${year}`;
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
