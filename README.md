# Radar Saham IDX

Website untuk memantau pergerakan saham di Bursa Efek Indonesia (IDX):
harga & volume, **akumulasi asing** (net foreign buy/sell), dan indikator
teknikal **akumulasi/distribusi** berbasis harga-volume sebagai proksi
"akumulasi bandar" & "retail distribusi".

## Menjalankan secara lokal

```bash
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

### Mode data

Secara default aplikasi mencoba mengambil data dari endpoint publik
(tidak resmi) yang dipakai situs idx.co.id sendiri untuk menampilkan
ringkasan perdagangan harian. Jika endpoint tersebut gagal diakses
(diblokir, berubah struktur, dsb.), aplikasi otomatis jatuh ke **data
contoh (mock)** yang deterministik per kode saham, disertai banner
peringatan di halaman.

Untuk memaksa memakai data contoh (misalnya saat mengembangkan di
lingkungan tanpa akses ke idx.co.id):

```bash
SAHAM_DATA_SOURCE=mock npm run dev
```

## Sumber data & keterbatasannya (penting)

IDX **tidak** menyediakan API publik resmi yang gratis. Yang dipakai di
sini adalah endpoint JSON tidak resmi (`www.idx.co.id/primary/TradingSummary/GetStockSummary`)
yang dipakai oleh situs idx.co.id sendiri untuk menampilkan tabel
"Ringkasan Saham" harian — endpoint ini bisa berubah atau berhenti
berfungsi tanpa pemberitahuan. Implementasinya ada di
`src/lib/idx/idxProvider.ts` dan ditulis defensif (banyak kemungkinan nama
field, fallback ke mock jika bentuk respons tak terduga) karena belum
sempat diverifikasi langsung terhadap endpoint live dari lingkungan
pengembangan awal (akses ke idx.co.id diblokir kebijakan jaringan sandbox
saat proyek ini dibuat). **Sebelum dipakai serius, verifikasi field-field
di `FIELD_ALIASES` terhadap respons asli.**

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

Jika suatu saat kamu punya akses ke provider data broker summary (API
berbayar/langganan), tinggal buat provider baru yang mengimplementasikan
`IdxProvider` (lihat `src/lib/idx/types.ts`) dan pasang di
`src/lib/idx/provider.ts` — arsitekturnya sudah dipisah supaya sumber data
bisa diganti tanpa menyentuh UI.

## Struktur proyek

```
src/
  app/
    page.tsx                  Halaman utama (pencarian saham)
    saham/[code]/page.tsx     Halaman detail saham
    api/stock/[code]/route.ts API JSON untuk data + indikator saham
  components/                 Komponen UI (chart, kartu ringkasan, dll.)
  lib/
    idx/
      types.ts                Tipe & interface provider data
      idxProvider.ts           Provider data real (endpoint IDX tidak resmi)
      mockProvider.ts          Provider data contoh (deterministik)
      provider.ts              Pemilih provider + fallback otomatis
      indicators.ts            Perhitungan indikator (foreign net, A/D line, sinyal)
      tickers.ts               Daftar kode saham untuk pencarian (tidak lengkap)
    format.ts                  Helper format angka/tanggal (locale id-ID)
```

## Roadmap yang masuk akal berikutnya

- Verifikasi & perbaiki `idxProvider.ts` terhadap respons live idx.co.id.
- Halaman screener/watchlist multi-saham (bukan hanya satu saham per halaman).
- Caching persisten (Redis/DB) untuk snapshot harian, bukan hanya in-memory.
- Daftar ticker lengkap (saat ini hanya berisi ~55 saham populer).
