export function Disclaimer() {
  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
      <p className="font-medium">Tentang data di halaman ini</p>
      <p className="mt-1 text-amber-700/90 dark:text-amber-300/80">
        Harga, volume, dan <em>net asing</em> diambil dari data ringkasan
        perdagangan harian IDX. IDX tidak menyediakan data ringkasan broker
        per saham secara gratis, sehingga sinyal{" "}
        <strong>&ldquo;Akumulasi/Distribusi&rdquo;</strong> dan{" "}
        <strong>&ldquo;Hari Retail Distribusi&rdquo;</strong> di atas adalah{" "}
        <strong>indikator teknikal</strong> (berbasis harga, volume, dan net
        asing) — bukan data posisi broker riil. Bagian{" "}
        <strong>&ldquo;Ringkasan Broker&rdquo;</strong> di bawah beda: itu data
        broker riil dari Stockbit (akun pribadi), hanya tersedia untuk saham
        yang masuk watchlist ingestion. Gunakan semua ini sebagai referensi
        tambahan, bukan satu-satunya dasar keputusan investasi.
      </p>
    </div>
  );
}
