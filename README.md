# Radar Saham IDX

Website untuk memantau pergerakan saham di Bursa Efek Indonesia (IDX):
harga & volume, **akumulasi asing** (net foreign buy/sell), dan indikator
teknikal **akumulasi/distribusi** berbasis harga-volume sebagai proksi
"akumulasi bandar" & "retail distribusi".

Data **bukan realtime by design**: sekali sehari, setelah market close,
sebuah cron job mengambil snapshot penuh pasar dari IDX dan menyimpannya
ke database. Website hanya membaca dari database itu — cocok untuk
memutuskan aksi besok pagi sebelum market buka, bukan untuk trading
intraday.

## Arsitektur data

```
Vercel Cron (tiap hari bursa, 16:30 WIB)
        │
        ▼
/api/cron/fetch-daily  ──fetch──▶  idx.co.id (endpoint tidak resmi)
        │
        ▼ upsert
   Postgres (tabel daily_bars)
        │
        ▼ baca
Halaman /saham/[code]  &  /api/stock/[code]
```

Jika database belum terhubung atau belum ada data untuk suatu kode saham
(mis. sebelum cron pertama berjalan), halaman otomatis menampilkan data
contoh (dummy) disertai banner peringatan — situs tidak pernah crash
karena data kosong.

## Menjalankan secara lokal

```bash
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000). Tanpa `DATABASE_URL`,
semua halaman otomatis memakai data contoh (dummy).

Untuk memaksa data contoh meski database sudah terhubung:

```bash
SAHAM_DATA_SOURCE=mock npm run dev
```

## Setup di Vercel (data asli)

1. **Deploy project ini ke Vercel** seperti biasa (import repo Git).
2. **Tambahkan database Postgres**: buka tab *Storage* di project Vercel →
   *Create Database* → pilih **Neon (Postgres)** → *Connect*. Vercel akan
   otomatis mengisi env var `DATABASE_URL` (atau `POSTGRES_URL`) ke
   project — tidak perlu setup manual lain.
3. **Set `CRON_SECRET`**: buka *Settings → Environment Variables*, tambah
   `CRON_SECRET` dengan nilai string acak (mis. hasil dari
   `openssl rand -hex 32`). Vercel Cron otomatis mengirim header
   `Authorization: Bearer <CRON_SECRET>` ke endpoint cron, dan endpoint
   ingestion menolak request tanpa header ini — supaya URL cron tidak bisa
   dipicu sembarang orang.
4. **Redeploy** setelah env var di atas ter-set.
5. Cron di `vercel.json` (`/api/cron/fetch-daily`, tiap hari bursa pukul
   16:30 WIB / 09:30 UTC) akan mulai jalan otomatis mulai hari kerja
   berikutnya.
6. **Isi data historis (backfill)** supaya chart tidak kosong sambil
   menunggu cron harian terkumpul. Panggil manual (ganti domain & secret):

   ```bash
   curl -H "Authorization: Bearer <CRON_SECRET>" \
     "https://<domain-kamu>/api/cron/backfill?days=30&offset=0"
   ```

   Endpoint ini dibatasi 30 hari bursa per panggilan (menghindari timeout
   function). Untuk riwayat lebih panjang, panggil lagi dengan
   `offset=30`, `offset=60`, dst. — respons memberi `nextOffset` yang bisa
   langsung dipakai.

Status ingestion terakhir (tanggal, jumlah saham, sukses/gagal) tampil di
halaman utama, dan bisa dicek programatis lewat `GET /api/status`.

### Catatan jam cron

IDX regular market tutup sekitar pukul 15:49–16:00 WIB. Jadwal cron diset
16:30 WIB untuk memberi buffer. Vercel Cron di plan Hobby tidak menjamin
presisi ke menit (bisa meleset hingga ±1 jam) — cukup untuk kebutuhan
"data setelah tutup pasar, dilihat sore/malam/besok pagi" di proyek ini.

### Temuan penting saat pengujian (belum terverifikasi penuh)

Saat menguji `/api/cron/fetch-daily` dari lingkungan pengembangan awal:
lewat proxy jaringan sandbox, request diblokir kebijakan jaringan
(bukan dari IDX). Lewat koneksi langsung (melewati proxy sandbox), request
**sampai ke idx.co.id** tapi dibalas **HTTP 403** — kemungkinan besar
proteksi anti-bot (WAF/Cloudflare) milik IDX, bukan sekadar endpoint yang
salah. Vercel men-deploy dari IP publik biasa (bukan lewat proxy sandbox
ini), jadi kemungkinan hasilnya beda — **tapi wajib dites ulang setelah
deploy** (panggil `/api/cron/fetch-daily` manual, cek responsnya).

Jika 403 masih muncul setelah deploy, kemungkinan perlu:
- Menambah header lain (`Accept-Language`, `sec-fetch-*`, dsb.) supaya
  lebih mirip request browser asli.
- Mengambil cookie session dengan GET ke halaman HTML idx.co.id dulu,
  baru pakai cookie itu untuk request ke endpoint JSON.
- Kalau IDX benar-benar memblokir traffic non-browser dari IP
  datacenter/hosting, pertimbangkan sumber data alternatif (mis. provider
  berbayar) — lihat bagian di atas tentang cara mengganti provider.

## Sumber data & keterbatasannya (penting)

IDX **tidak** menyediakan API publik resmi yang gratis. Yang dipakai di
sini adalah endpoint JSON tidak resmi (`www.idx.co.id/primary/TradingSummary/GetStockSummary`)
yang dipakai oleh situs idx.co.id sendiri untuk menampilkan tabel
"Ringkasan Saham" harian — endpoint ini bisa berubah atau berhenti
berfungsi tanpa pemberitahuan. Implementasinya ada di
`src/lib/idx/idxSource.ts` dan ditulis defensif (banyak kemungkinan nama
field, error yang jelas jika bentuk respons tak terduga) karena belum
sempat diverifikasi langsung terhadap endpoint live dari lingkungan
pengembangan awal (akses ke idx.co.id diblokir kebijakan jaringan sandbox
saat proyek ini dibuat). **Sebelum dipakai serius, verifikasi field-field
di `FIELD_ALIASES` terhadap respons asli** — cara termudah: deploy lalu
panggil `/api/cron/fetch-daily` manual dengan header `Authorization`,
lihat hasilnya di tabel `daily_bars`.

Data ini mencakup harga OHLC, volume, value, frekuensi, dan
**foreign buy/sell per saham per hari** — cukup untuk menghitung
akumulasi asing secara akurat.

Yang **tidak** tersedia gratis dari IDX: ringkasan broker per saham
(siapa beli/jual, berapa lot, per sekuritas) seperti yang ditampilkan
platform bandarmology berbayar (mis. Stockbit, RTI). Karena itu, indikator
"Akumulasi/Distribusi" dan "Hari Retail Distribusi" di halaman detail
saham adalah **indikator teknikal turunan** (Chaikin Accumulation/
Distribution Line + volume relatif + arah net asing), bukan data posisi
broker yang sesungguhnya. Ini dijelaskan juga di banner disclaimer pada
tiap halaman saham.

## Struktur proyek

```
src/
  app/
    page.tsx                       Halaman utama (pencarian saham)
    saham/[code]/page.tsx          Halaman detail saham
    api/stock/[code]/route.ts      API JSON untuk data + indikator saham
    api/cron/fetch-daily/route.ts  Ingestion harian (dipanggil Vercel Cron)
    api/cron/backfill/route.ts     Ingestion manual untuk riwayat lama
    api/status/route.ts            Status ingestion terakhir
  components/                      Komponen UI (chart, kartu ringkasan, dll.)
  lib/
    idx/
      types.ts                     Tipe & interface data saham
      idxSource.ts                 Fetch live dari IDX (dipakai ingestion saja)
      mockProvider.ts              Provider data contoh (deterministik)
      provider.ts                  Baca dari DB, fallback ke mock
      indicators.ts                Perhitungan indikator (foreign net, A/D line, sinyal)
      tickers.ts                   Daftar kode saham untuk pencarian (tidak lengkap)
    db/
      client.ts                    Koneksi Postgres (Neon serverless driver)
      schema.ts                    Migrasi idempoten (CREATE TABLE IF NOT EXISTS)
      store.ts                     Upsert snapshot harian & query per kode saham
    cronAuth.ts                    Verifikasi header CRON_SECRET
    format.ts                      Helper format angka/tanggal (locale id-ID)
vercel.json                        Jadwal Vercel Cron
```

## Roadmap yang masuk akal berikutnya

- Verifikasi & perbaiki `idxSource.ts` terhadap respons live idx.co.id.
- Halaman screener/watchlist multi-saham (bukan hanya satu saham per halaman).
- Daftar ticker lengkap (saat ini hanya berisi ~55 saham populer) — atau
  ambil daftar saham langsung dari kolom `code` di tabel `daily_bars`
  setelah ada data.
- Notifikasi (email/WhatsApp) ringkasan sinyal tiap malam setelah
  ingestion selesai.
