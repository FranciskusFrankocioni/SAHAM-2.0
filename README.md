# Radar Saham IDX

Website untuk memantau pergerakan saham di Bursa Efek Indonesia (IDX):
harga & volume, **akumulasi asing** (net foreign buy/sell), dan indikator
teknikal **akumulasi/distribusi** berbasis harga-volume sebagai proksi
"akumulasi bandar" & "retail distribusi".

Data **tidak streaming tick-by-tick** (IDX tidak menyediakan itu gratis ke
siapa pun), tapi diusahakan sedekat mungkin dengan kondisi terkini:
snapshot harga/volume/net asing di-refresh **tiap ~15 menit selama jam
bursa** (lihat bagian "Update selama jam bursa" di bawah), bukan cuma
sekali setelah close. Broker summary tetap sekali sehari setelah close,
karena sifatnya memang ringkasan akhir hari.

## Arsitektur data

```
GitHub Actions (Python + curl_cffi, tiap 15 menit, jam bursa)
        │  scripts/fetch_idx_daily.py
        ▼ fetch                                idx.co.id (endpoint tidak resmi)
        │ upsert langsung ke Postgres
        ▼
  Postgres: daily_bars  ◀── scripts/backfill_idx.py (manual, isi riwayat)

Vercel Cron (1x/hari, 16:40 WIB)
        │
        ▼
  /api/cron/fetch-broker-summary  ──fetch──▶ exodus.stockbit.com (token pribadi)
        │ upsert                                top-5 broker per saham watchlist
        ▼
  Postgres: broker_summary

                    Keduanya dibaca oleh:
              Halaman /saham/[code]  &  /api/stock/[code]
```

Harga/volume/net asing **tidak** diambil oleh route Next.js
(`/api/cron/fetch-daily`) lagi — endpoint IDX menolak request dari
runtime Node.js Vercel dengan HTTP 403 walau sudah pakai session cookie
yang benar (kemungkinan deteksi fingerprint TLS/HTTP2, bukan sekadar
cookie). Route Next.js-nya masih ada di kode (untuk referensi/percobaan
manual) tapi **tidak dijadwalkan** lagi. Broker summary (Stockbit) tidak
kena masalah yang sama, jadi tetap lewat Vercel Cron seperti semula.

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
5. Lanjut ke bagian **"Update selama jam bursa (GitHub Actions)"** di
   bawah — itu yang benar-benar mengisi `daily_bars` (harga/volume/net
   asing), bukan Vercel Cron.

Status ingestion terakhir (tanggal, jumlah saham, sukses/gagal) tampil di
halaman utama, dan bisa dicek programatis lewat `GET /api/status`.

## Update selama jam bursa (GitHub Actions + Python)

Dua masalah, satu solusi:

1. Vercel Cron di plan **Hobby** hanya bisa dijadwalkan **1x sehari**.
2. Endpoint IDX menolak (**HTTP 403**) request dari runtime Node.js
   Vercel — sudah dikonfirmasi di production, bahkan setelah pakai
   session cookie yang benar. Ini kemungkinan besar deteksi di level
   *fingerprint* TLS/HTTP2 (mirip yang dipakai Cloudflare), bukan cuma
   soal cookie — dan Node `fetch()` tidak punya cara mudah untuk
   menirukan fingerprint browser asli di level itu.

Solusinya: `scripts/fetch_idx_daily.py`, skrip Python yang pakai
[`curl_cffi`](https://github.com/lexiforest/curl_cffi) (`impersonate="chrome"`)
untuk menirukan fingerprint Chrome asli — teknik yang sama dipakai proyek
open-source [`idx-bei`](https://github.com/nichsedge/idx-bei) yang masih
aktif jalan. Skrip ini connect **langsung ke Postgres** (bukan lewat
Next.js/Vercel sama sekali), dijalankan oleh
`.github/workflows/fetch-daily.yml` **tiap 15 menit, jam 09:00–16:00 WIB,
Senin–Jumat**.

**Setup di GitHub** (repo → *Settings → Secrets and variables → Actions*):
1. Tambah secret `DATABASE_URL` — **connection string Postgres yang sama**
   dengan yang ada di Environment Variables project Vercel kamu (buka
   Vercel → Settings → Environment Variables → lihat/copy nilai
   `DATABASE_URL`)
2. Workflow otomatis aktif begitu file-nya ter-push ke branch default.
   Bisa dites manual: tab **Actions** (di repo GitHub, bukan Vercel) →
   pilih **"Fetch IDX daily snapshot (frequent, trading hours)"** →
   **Run workflow** → tunggu selesai → klik run-nya → lihat log-nya
   (harus muncul `OK: upserted N rows for YYYY-MM-DD`)

**Isi data historis (backfill)** — sekali di awal, supaya chart tidak
kosong sambil menunggu data harian terkumpul:
1. Tab **Actions** → pilih **"Backfill IDX history"** → **Run workflow**
2. Isi `days` (default 30) dan `offset` (default 0), lalu jalankan
3. Untuk riwayat lebih panjang, ulangi dengan `offset` = 30, 60, dst.
   (log run-nya kasih tahu offset berikutnya)

`/api/cron/fetch-daily` dan `/api/cron/backfill` (route Next.js) masih
ada di kode sebagai fallback manual, tapi tidak dijadwalkan — keduanya
kemungkinan besar tetap kena 403 sampai ada perbaikan lebih lanjut untuk
runtime Node.js.

**Kenapa bukan realtime beneran, dan trade-off-nya:**
- IDX tidak menyediakan data streaming/tick-by-tick gratis untuk siapa
  pun. 15 menit adalah kompromi wajar antara "cukup update" dan "tidak
  membebani/mencurigakan" buat endpoint yang memang tidak resmi.
- Makin sering polling, makin besar kemungkinan pola requestnya
  terdeteksi sebagai bot. Kalau mulai sering gagal, turunkan frekuensinya
  (ubah `*/15 2-9 * * 1-5` di `fetch-daily.yml`, mis. jadi `*/30 ...`).
- Jadwal GitHub Actions tidak dijamin presisi ke menit (bisa meleset
  beberapa menit saat GitHub sedang sibuk).

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

### Temuan penting saat pengujian

Riwayat singkatnya:
1. Percobaan awal memanggil endpoint IDX (hanya header `Referer`/`User-Agent`)
   → **HTTP 403**.
2. Ditambah session cookie (`createIdxSession` di `idxSource.ts`, meniru
   [`NeaByteLab/IDX-API`](https://github.com/NeaByteLab/IDX-API)) → **masih
   HTTP 403**, dikonfirmasi langsung dari server Vercel production (bukan
   masalah jaringan sandbox pengembangan).
3. Kesimpulan: proteksinya kemungkinan besar di level *fingerprint*
   TLS/HTTP2, bukan cuma cookie — dan runtime Node.js Vercel tidak bisa
   dengan mudah menirukan fingerprint browser asli di level itu.
4. **Perbaikan yang dipakai sekarang:** pindah ke Python + `curl_cffi`
   (`impersonate="chrome"`), dijalankan lewat GitHub Actions, langsung ke
   Postgres — lihat bagian "Update selama jam bursa" di atas. Teknik ini
   terbukti dipakai proyek [`idx-bei`](https://github.com/nichsedge/idx-bei)
   yang masih aktif berjalan.

Route Next.js (`/api/cron/fetch-daily`, `/api/cron/backfill`) masih ada
di kode tapi **belum diverifikasi berhasil** dan tidak dijadwalkan lagi —
kalau suatu saat proteksi IDX berubah/kendor, keduanya bisa dites ulang
manual lewat `?secret=<CRON_SECRET>` di URL.

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
    api/cron/fetch-daily/route.ts           Legacy/fallback manual (kena 403 dari Node.js)
    api/cron/fetch-broker-summary/route.ts  Ingestion broker summary watchlist (Vercel Cron)
    api/cron/backfill/route.ts              Legacy/fallback manual (kena 403 dari Node.js)
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
scripts/
  fetch_idx_daily.py               Fetch harian real (Python + curl_cffi) → langsung ke Postgres
  backfill_idx.py                  Isi riwayat lama (manual, via GitHub Actions)
  requirements.txt                 Dependency Python (curl_cffi, psycopg2-binary)
vercel.json                        Jadwal Vercel Cron (broker summary saja)
.github/workflows/
  fetch-daily.yml                  Jadwal GitHub Actions (tiap 15 menit, jam bursa)
  backfill-idx.yml                 Trigger manual buat isi riwayat lama
```

## Roadmap yang masuk akal berikutnya

- Verifikasi `scripts/fetch_idx_daily.py` beneran lolos 403 IDX setelah
  jalan di GitHub Actions (lihat bagian "Update selama jam bursa").
- Halaman screener/watchlist multi-saham (bukan hanya satu saham per halaman).
- Daftar ticker lengkap (saat ini hanya berisi ~55 saham populer) — atau
  ambil daftar saham langsung dari kolom `code` di tabel `daily_bars`
  setelah ada data.
- Notifikasi (email/WhatsApp) ringkasan sinyal tiap malam setelah
  ingestion selesai.
