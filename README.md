# Radar Saham IDX

Website untuk memantau pergerakan saham di Bursa Efek Indonesia (IDX):
harga & volume, **akumulasi asing** (net foreign buy/sell dalam Rupiah),
indikator teknikal **akumulasi/distribusi** berbasis harga-volume sebagai
proksi "akumulasi bandar" & "retail distribusi", dan **ringkasan broker
riil** (top-5 broker pembeli/penjual per saham).

Data **tidak streaming tick-by-tick**, tapi diusahakan sedekat mungkin
dengan kondisi terkini: di-refresh **tiap ~15 menit selama jam bursa**
untuk saham-saham di watchlist pribadimu (lihat "Update selama jam bursa"
di bawah), bukan cuma sekali setelah close.

## Sumber data: Stockbit, bukan IDX langsung

Semua data (harga/volume/net asing **dan** broker summary) diambil dari
**akun Stockbit pribadi** (`exodus.stockbit.com`), bukan dari idx.co.id
langsung. Alasannya: idx.co.id memblokir request dari IP GitHub
Actions/Vercel dengan halaman **"Attention Required" Cloudflare**
(proteksi anti-bot interaktif, bukan cuma soal header/cookie — dikonfirmasi
lewat pengujian langsung, lihat "Riwayat teknis" di bawah). Stockbit,
sebagai API terautentikasi (Bearer token), tidak menunjukkan proteksi yang
sama seketat itu.

**Konsekuensi penting:** karena datanya lewat akun pribadi (bukan endpoint
publik bebas), cakupannya **sengaja dibatasi ke watchlist kamu** (bukan
seluruh ~840 saham di pasar) — supaya pola aksesnya wajar dan tidak
membebani/berisiko ke akun. Saham di luar watchlist tetap bisa dicari,
tapi akan menampilkan data contoh (dummy) sampai kamu tambahkan ke
watchlist.

## Arsitektur data

```
GitHub Actions (tiap 15 menit, jam bursa)
        │  scripts/fetch_stockbit_daily.py
        ▼ fetch harga/volume/net asing         exodus.stockbit.com
        │ upsert langsung ke Postgres           (token pribadi)
        ▼
  Postgres: daily_bars  ◀── scripts/backfill_stockbit.py (manual, isi riwayat)

Vercel Cron (1x/hari, 16:40 WIB)
        │
        ▼
  /api/cron/fetch-broker-summary  ──fetch──▶ exodus.stockbit.com (token sama)
        │ upsert                                top-5 broker per saham watchlist
        ▼
  Postgres: broker_summary

                    Keduanya dibaca oleh:
              Halaman /saham/[code]  &  /api/stock/[code]
```

Jika database belum terhubung atau belum ada data untuk suatu kode saham
(mis. saham di luar watchlist, atau sebelum ingestion pertama berjalan),
halaman otomatis menampilkan data contoh (dummy) disertai banner
peringatan — situs tidak pernah crash karena data kosong.

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

## Setup

### 1. Vercel (hosting + database)

1. **Deploy project ini ke Vercel** seperti biasa (import repo Git).
2. **Tambahkan database Postgres**: tab *Storage* di project Vercel →
   *Create Database* → pilih **Neon (Postgres)** → *Connect*. Vercel
   otomatis mengisi env var `DATABASE_URL`.
3. **Set `CRON_SECRET`**: *Settings → Environment Variables*, tambah
   `CRON_SECRET` dengan nilai string acak (mis. hasil dari
   `openssl rand -hex 32`). Dipakai untuk otentikasi endpoint ingestion —
   baik oleh Vercel Cron maupun panggilan manual.
4. **Ambil token Stockbit** (lihat langkah di bawah), lalu tambah env var
   `STOCKBIT_TOKEN` = token yang disalin.
5. **(Opsional) `WATCHLIST_CODES`** = daftar kode saham pribadi dipisah
   koma, mis. `BBCA,ADRO,GOTO`. Kalau dilewati, otomatis pakai daftar
   default 10 saham likuid (`BBCA,BBRI,BMRI,BBNI,TLKM,ASII,GOTO,ADRO,ANTM,ICBP`
   — lihat `DEFAULT_WATCHLIST` di `tickers.ts`/`fetch_stockbit_daily.py`).
   Ganti kapan saja sesuai saham yang mau kamu pantau.
6. **Redeploy** setelah semua env var di atas ter-set.

### 2. Ambil token Stockbit

Login Stockbit dilindungi reCAPTCHA, dan proyek ini sengaja **tidak**
membuat automasi yang menjebol proteksi itu — sebagai gantinya, kamu
ambil satu token akses secara manual, berkala (token kadaluarsa dalam
hitungan jam–hari):

1. Login ke [stockbit.com](https://stockbit.com) seperti biasa di browser desktop
2. Buka Developer Tools (F12) → tab **Network**
3. Refresh halaman apa saja di Stockbit
4. Cari request ke domain **exodus.stockbit.com**, buka tab **Headers**
5. Salin nilai setelah `Authorization: Bearer ` (token panjang berformat JWT)

Saat token kadaluarsa, `ingestion_log`/`GET /api/status` akan
menunjukkan status `error`/`token_expired` — ulangi langkah di atas dan
update `STOCKBIT_TOKEN` di Vercel **dan** GitHub Secrets (langkah
berikutnya), lalu redeploy/tidak perlu redeploy untuk GitHub (secret
langsung dipakai run berikutnya).

### 3. GitHub Actions (update tiap 15 menit + backfill)

Vercel Cron di plan **Hobby** hanya bisa dijadwalkan 1x sehari — nggak
cukup buat kebutuhan update berkala selama jam bursa. GitHub Actions
(gratis, tidak terikat plan Vercel) yang menjalankan ingestion
sesungguhnya untuk harga/volume/net asing.

**Setup di GitHub** (repo → *Settings → Secrets and variables → Actions*
→ *New repository secret*, tambahkan satu-satu):
1. `DATABASE_URL` — **sama persis** dengan yang di Vercel
2. `STOCKBIT_TOKEN` — **sama persis** dengan yang di Vercel
3. `WATCHLIST_CODES` — **opsional**, sama persis dengan yang di Vercel
   kalau kamu isi. Kalau dilewati di kedua tempat, otomatis pakai daftar
   default yang sama (lihat langkah 5 di atas).

⚠️ Saat paste `DATABASE_URL`: copy **hanya baris URL-nya saja**
(`postgresql://...`), jangan ikut baris komentar `#` atau baris lain dari
snippet — itu bikin koneksi gagal parse. (Skrip ingestion sudah dibuat
toleran terhadap kesalahan ini, tapi lebih aman kalau bersih dari awal.)

**Tes manual** (jangan tunggu jadwal otomatis): tab **Actions** di repo
GitHub → pilih **"Fetch daily price/volume/foreign-flow (frequent,
trading hours)"** → **Run workflow** → tunggu ~10 detik → buka run-nya →
lihat log (harus muncul `<KODE>: OK (N rows)` untuk tiap saham di
watchlist).

**Isi data historis (backfill)** — sekali di awal:
1. Tab **Actions** → pilih **"Backfill Stockbit price history"** →
   **Run workflow**
2. Isi `days` (default 90), jalankan
3. Beda dari pendekatan IDX lama: satu panggilan per saham sudah bisa
   ambil rentang tanggal langsung (dengan paginasi otomatis), jadi
   biasanya sekali jalan sudah cukup

Status ingestion terakhir tampil di halaman utama, dan bisa dicek
programatis lewat `GET /api/status`.

### 4. Broker summary (Vercel Cron)

`/api/cron/fetch-broker-summary` (Node.js/Vercel, bukan Python) jalan
otomatis tiap hari bursa jam 16:40 WIB, memakai `STOCKBIT_TOKEN` +
`WATCHLIST_CODES` yang sama. Ini terpisah dari ingestion harga karena
sifatnya ringkasan akhir hari saja (tidak perlu update tiap 15 menit).
Bisa dipanggil manual:

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" \
  "https://<domain-kamu>/api/cron/fetch-broker-summary"
```

atau lewat browser: `https://<domain-kamu>/api/cron/fetch-broker-summary?secret=<CRON_SECRET>`

## Riwayat teknis (kenapa arsitekturnya begini)

1. Percobaan awal memanggil endpoint IDX langsung (header
   `Referer`/`User-Agent` saja) → **HTTP 403**.
2. Ditambah session cookie (meniru
   [`NeaByteLab/IDX-API`](https://github.com/NeaByteLab/IDX-API)) →
   **masih HTTP 403**, dikonfirmasi dari server Vercel production.
3. Pindah ke Python + [`curl_cffi`](https://github.com/lexiforest/curl_cffi)
   (`impersonate="chrome"`, teknik yang dipakai
   [`idx-bei`](https://github.com/nichsedge/idx-bei)) dijalankan lewat
   GitHub Actions → **masih HTTP 403**. Isi responsnya ternyata halaman
   **"Attention Required" Cloudflare** — proteksi *interaktif* (butuh
   JavaScript/CAPTCHA beneran jalan), bukan sekadar deteksi
   fingerprint/cookie yang bisa ditirukan lewat request biasa. IP
   GitHub Actions kemungkinan besar sudah masuk daftar "mencurigakan"
   Cloudflare karena memang sering dipakai untuk scraping massal.
4. **Solusi final:** pindah sumber data ke Stockbit (`exodus.stockbit.com`)
   — API terautentikasi milik aplikasi yang sudah dipakai untuk broker
   summary, ternyata juga punya endpoint harga historis
   (`company-price-feed/historical/summary/{ticker}`) dan foreign flow
   dalam satu response yang sama. Endpoint & skema field direkonstruksi
   dari proyek open-source komunitas (`satriyop/ai-saham`,
   `naufalhajid/IDX-Debate-Engine`, dkk) — lihat komentar di
   `scripts/fetch_stockbit_daily.py`.

`scripts/fetch_idx_daily.py`, `scripts/backfill_idx.py`, dan
`.github/workflows/backfill-idx.yml` (pendekatan langsung ke IDX) masih
ada di kode sebagai referensi, tapi **tidak dijadwalkan** — kena 403
Cloudflare yang sama. Begitu juga `src/app/api/cron/fetch-daily/route.ts`
dan `/api/cron/backfill/route.ts` (versi Node.js-nya).

### Catatan satuan data

Data harga/volume/foreign-flow sekarang dari Stockbit, bukan IDX, dengan
sedikit beda satuan dibanding rencana awal:
- `volume` di respons Stockbit dalam **lot** (1 lot = 100 lembar) —
  dikonversi ke lembar saat disimpan, supaya konsisten dengan chart yang
  sudah ada.
- `foreign_buy`/`foreign_sell` di Stockbit dalam **nilai Rupiah**, bukan
  volume lembar (beda dari rencana awal yang berbasis endpoint IDX). Ini
  sudah disesuaikan di label UI ("Net Asing (Rp)").

**Catatan cakupan broker summary:** breakdown "broker X beli/jual berapa
lot saham Y" tidak tersedia gratis dari IDX resmi — itulah kenapa fitur
Ringkasan Broker di proyek ini juga lewat Stockbit (akun pribadi), bukan
IDX.

## Sumber data & keterbatasannya (penting)

Baik harga/volume/net asing maupun broker summary sekarang berasal dari
Stockbit — bukan sumber gratis/publik, tapi akun pribadi milikmu. Karena
itu:
- Cakupannya terbatas ke `WATCHLIST_CODES`, bukan seluruh pasar
- Bergantung pada token yang harus di-refresh manual secara berkala
- Endpoint & skema field-nya direkonstruksi dari proyek open-source
  komunitas (Stockbit tidak punya dokumentasi API resmi) — kalau
  Stockbit ubah struktur responsnya, ingestion bisa berhenti tanpa
  pemberitahuan; cek `ingestion_log`/`GET /api/status` secara berkala.

Indikator "Akumulasi/Distribusi" dan "Hari Retail Distribusi" di halaman
detail saham **tetap** berupa indikator teknikal turunan (Chaikin
Accumulation/Distribution Line + volume relatif + arah net asing) — beda
dari tabel "Ringkasan Broker" di bawahnya yang datanya riil dari
Stockbit. Ini dijelaskan di banner disclaimer pada tiap halaman saham.

## Struktur proyek

```
src/
  app/
    page.tsx                       Halaman utama (pencarian saham)
    saham/[code]/page.tsx          Halaman detail saham
    api/stock/[code]/route.ts      API JSON untuk data + indikator saham
    api/cron/fetch-daily/route.ts           Legacy/fallback manual (kena 403 dari IDX)
    api/cron/fetch-broker-summary/route.ts  Ingestion broker summary watchlist (Vercel Cron)
    api/cron/backfill/route.ts              Legacy/fallback manual (kena 403 dari IDX)
    api/status/route.ts                     Status ingestion terakhir
  components/                      Komponen UI (chart, kartu ringkasan, dll.)
  lib/
    idx/
      types.ts                     Tipe & interface data saham
      idxSource.ts                 Fetch live dari IDX (legacy, tidak dipakai ingestion aktif)
      mockProvider.ts              Provider data contoh (deterministik)
      provider.ts                  Baca dari DB, fallback ke mock
      indicators.ts                Perhitungan indikator (foreign net, A/D line, sinyal)
      tickers.ts                   Daftar kode saham untuk pencarian (tidak lengkap)
    stockbit/
      types.ts                     Tipe & error khusus Stockbit (termasuk token expired)
      stockbitSource.ts            Fetch broker distribution dari exodus.stockbit.com (Node)
    db/
      client.ts                    Koneksi Postgres (Neon serverless driver)
      schema.ts                    Migrasi idempoten (CREATE TABLE IF NOT EXISTS)
      store.ts                     Upsert snapshot/broker summary & query per kode saham
    cronAuth.ts                    Verifikasi header/query CRON_SECRET
    format.ts                      Helper format angka/tanggal (locale id-ID)
scripts/
  fetch_stockbit_daily.py          Ingestion harga/volume/net asing aktif (via GitHub Actions)
  backfill_stockbit.py             Isi riwayat harga dari Stockbit (manual, via GitHub Actions)
  fetch_idx_daily.py                Legacy: fetch langsung IDX (kena 403 Cloudflare, referensi)
  backfill_idx.py                   Legacy: backfill langsung IDX (kena 403 Cloudflare, referensi)
  requirements.txt                 Dependency Python (curl_cffi, psycopg2-binary)
vercel.json                        Jadwal Vercel Cron (broker summary saja)
.github/workflows/
  fetch-daily.yml                  Jadwal aktif: fetch Stockbit tiap 15 menit, jam bursa
  backfill-stockbit.yml            Trigger manual: isi riwayat harga dari Stockbit
  backfill-idx.yml                  Legacy, tidak dipakai (kena 403 Cloudflare)
```

## Roadmap yang masuk akal berikutnya

- Verifikasi `scripts/fetch_stockbit_daily.py` di run pertama GitHub
  Actions setelah `STOCKBIT_TOKEN`/`WATCHLIST_CODES` ter-set (lihat
  bagian Setup di atas).
- Halaman screener/watchlist multi-saham (bukan hanya satu saham per halaman).
- Backfill broker summary historis (saat ini broker summary cuma
  tersimpan mulai dari hari ingestion pertama jalan, tidak ada backfill
  untuk data lama).
- Notifikasi (email/WhatsApp) ringkasan sinyal tiap malam setelah
  ingestion selesai.
