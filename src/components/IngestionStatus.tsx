import { isDbConfigured } from "@/lib/db/client";
import { getLatestIngestionRun } from "@/lib/db/store";
import { formatDateShort } from "@/lib/format";

type Status =
  | { kind: "no-db" }
  | { kind: "no-data" }
  | { kind: "load-error" }
  | { kind: "run"; label: string; dotColor: string };

async function loadStatus(): Promise<Status> {
  if (!isDbConfigured()) return { kind: "no-db" };

  let lastRun: Awaited<ReturnType<typeof getLatestIngestionRun>>;
  try {
    lastRun = await getLatestIngestionRun();
  } catch {
    return { kind: "load-error" };
  }

  if (!lastRun) return { kind: "no-data" };

  const label =
    lastRun.status === "ok"
      ? `Data per ${formatDateShort(lastRun.runDate)} (${lastRun.rowsUpserted} saham)`
      : lastRun.status === "empty"
        ? `${formatDateShort(lastRun.runDate)}: tidak ada data (libur/akhir pekan)`
        : `Gagal mengambil data ${formatDateShort(lastRun.runDate)}`;
  const dotColor =
    lastRun.status === "ok"
      ? "bg-emerald-500"
      : lastRun.status === "empty"
        ? "bg-zinc-400"
        : "bg-rose-500";

  return { kind: "run", label, dotColor };
}

export async function IngestionStatus() {
  const status = await loadStatus();

  if (status.kind === "no-db") {
    return (
      <p className="text-xs text-zinc-500">
        Database belum terhubung &mdash; menampilkan data contoh.
      </p>
    );
  }
  if (status.kind === "no-data") {
    return (
      <p className="text-xs text-zinc-500">
        Belum ada data yang tersimpan. Jalankan ingestion pertama kali (lihat README).
      </p>
    );
  }
  if (status.kind === "load-error") {
    return <p className="text-xs text-zinc-500">Status ingestion tidak dapat dimuat.</p>;
  }

  return (
    <p className="flex items-center justify-center gap-1.5 text-xs text-zinc-500">
      <span className={`h-1.5 w-1.5 rounded-full ${status.dotColor}`} />
      {status.label}
    </p>
  );
}
