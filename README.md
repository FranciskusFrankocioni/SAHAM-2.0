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
        ├──▶ /api/cron/fetch-daily            ──fetch──▶ idx.co.id (endpoint tidak resmi)
        │           │ upsert                                harga, volume, net asing
        │           ▼
        │      Postgres: daily_bars
        │
        └──▶ /api/cron/fetch-broker-summary   ──fetch──▶ exodus.stockbit.com (token pribadi)
                    │ upsert                                 top-5 broker per saham watchlist
                    ▼
               Postgres: broker_summary
        │
        ▼ baca keduanya
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

## Ringkasan Broker (data broker riil, opsional)

Selain harga/volume/net asing dari IDX, ada satu fitur tambahan:
**Ringkasan Broker** (top-5 broker pembeli & penjual per saham per hari) —
ini data **riil**, bukan indikator turunan, diambil dari akun Stockbit
pribadi. Fitur ini opsional dan sengaja **tidak otomatis**: login Stockbit
dilindungi reCAPTCHA, dan proyek ini sengaja tidak membuat automasi yang
menjebol proteksi itu. Sebagai gantinya, kamu ambil satu token akses
secara manual dan berkala.

**Cara ambil token:**
1. Login ke [stockbit.com](https://stockbit.com) seperti biasa di browser desktop
2. Buka Developer Tools (F12) → tab **Network**
3. Refresh halaman apa saja di Stockbit
4. Cari request ke domain **exodus.stockbit.com**, buka tab **Headers**
5. Salin nilai setelah `Authorization: Bearer ` (token panjang berformat JWT)

**Setup di Vercel:**
1. Tambah env var `STOCKBIT_TOKEN` = token yang disalin tadi
2. Tambah env var `WATCHLIST_CODES` = daftar kode saham pribadi dipisah koma,
   mis. `BBCA,ADRO,GOTO` — **sengaja dibatasi ke watchlist**, bukan seluruh
   pasar (840+ saham), supaya pola akses lebih wajar & tidak membebani akun
   pribadi
3. Redeploy

Cron `/api/cron/fetch-broker-summary` jalan otomatis tiap hari bursa
(jadwal sama dengan `fetch-daily`, lihat `vercel.json`) untuk kode-kode di
`WATCHLIST_CODES`. Bisa juga dipanggil manual:

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" \
  "https://<domain-kamu>/api/cron/fetch-broker-summary"
```

**Token akan kadaluarsa** (biasanya hitungan jam–hari). Saat itu terjadi,
respons cron akan berstatus `token_expired` dan `ingestion_log` mencatatnya
— ulangi langkah "Cara ambil token" di atas dan update env var
`STOCKBIT_TOKEN`, lalu redeploy. Tidak ada auto-refresh karena proses login
awalnya sendiri dilindungi captcha (lihat di atas).

Endpoint & bentuk respons Stockbit direkonstruksi dari proyek open-source
komunitas (Stockbit tidak punya dokumentasi API resmi), jadi parsing di
`stockbitSource.ts` ditulis defensif. **Verifikasi setelah deploy** —
kalau tabel `broker_summary` kosong padahal token & watchlist sudah benar,
kemungkinan bentuk respons Stockbit berbeda dari dugaan; kabari saya
detail responsnya.

### Catatan jam cron

IDX regular market tutup sekitar pukul 15:49–16:00 WIB. Jadwal cron diset
16:30 WIB untuk memberi buffer. Vercel Cron di plan Hobby tidak menjamin
presisi ke menit (bisa meleset hingga ±1 jam) — cukup untuk kebutuhan
"data setelah tutup pasar, dilihat sore/malam/besok pagi" di proyek ini.

### Temuan penting saat pengujian (belum terverifikasi penuh)

Percobaan awal memanggil endpoint IDX langsung (hanya dengan header
`Referer`/`User-Agent`) dibalas **HTTP 403**. Setelah membandingkan dengan
proyek open-source [`NeaByteLab/IDX-API`](https://github.com/NeaByteLab/IDX-API)
yang memakai endpoint sama, ternyata `idx.co.id/primary/*` butuh **sesi**:
GET dulu ke halaman HTML `idx.co.id/id` untuk dapat cookie, baru cookie
itu dipakai di request ke endpoint JSON (lihat `createIdxSession` di
`idxSource.ts`). Perbaikan ini sudah diterapkan, tapi **belum bisa
diverifikasi langsung** karena lingkungan pengembangan proyek ini
diblokir kebijakan jaringan untuk mengakses `idx.co.id` sama sekali.
**Wajib dites setelah deploy** — panggil `/api/cron/fetch-daily` manual
dan cek responsnya:

- `status: "ok"` → sudah beres, data asli mulai masuk ke database.
- `error` menyebut `DATABASE_URL` → IDX-nya sudah lolos, tinggal
  connect database (lihat langkah setup di atas).
- `error` masih menyebut IDX (403, "did not return a session cookie",
  dsb.) → proteksi anti-bot IDX kemungkinan lebih ketat dari dugaan;
  kabari saya hasil responsnya biar saya sesuaikan lagi.

**Catatan penting soal cakupan data:** endpoint-endpoint di atas (baik di
proyek ini maupun di `IDX-API`) hanya memberi ringkasan **per saham per
hari** (harga, volume, net asing) dan ringkasan broker **agregat se-pasar**
(ranking broker paling aktif, bukan per saham). **Tidak ada** endpoint
gratis dari IDX yang memberi breakdown "broker X beli/jual berapa lot
saham Y" per saham — itu tetap perlu sumber lain (lihat bagian "Sumber
data & keterbatasannya" di bawah).

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
    api/cron/fetch-daily/route.ts           Ingestion harga/volume/net asing (Vercel Cron)
    api/cron/fetch-broker-summary/route.ts  Ingestion broker summary watchlist (Vercel Cron)
    api/cron/backfill/route.ts              Ingestion manual untuk riwayat lama
    api/status/route.ts                     Status ingestion terakhir
  components/                      Komponen UI (chart, kartu ringkasan, dll.)
  lib/
    idx/
      types.ts                     Tipe & interface data saham
      idxSource.ts                 Fetch live dari IDX (dipakai ingestion saja)
      mockProvider.ts              Provider data contoh (deterministik)
      provider.ts                  Baca dari DB, fallback ke mock
      indicators.ts                Perhitungan indikator (foreign net, A/D line, sinyal)
      tickers.ts                   Daftar kode saham untuk pencarian (tidak lengkap)
    stockbit/
      types.ts                     Tipe & error khusus Stockbit (termasuk token expired)
      stockbitSource.ts            Fetch broker distribution dari exodus.stockbit.com
    db/
      client.ts                    Koneksi Postgres (Neon serverless driver)
      schema.ts                    Migrasi idempoten (CREATE TABLE IF NOT EXISTS)
      store.ts                     Upsert snapshot/broker summary & query per kode saham
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
