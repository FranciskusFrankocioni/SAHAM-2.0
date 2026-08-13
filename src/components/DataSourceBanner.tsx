export function DataSourceBanner({ warning }: { warning: string }) {
  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-xs leading-relaxed text-blue-800 dark:text-blue-300">
      <p className="font-medium">Mode data contoh</p>
      <p className="mt-1 text-blue-700/90 dark:text-blue-300/80">{warning}</p>
    </div>
  );
}
