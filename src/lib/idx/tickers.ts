// Curated (NOT exhaustive) list of well-known IDX-listed tickers, used only
// to power search suggestions and to show a display name when the live IDX
// name lookup fails. This list is not the source of price/trading data.
// Users can always type any 4-letter IDX code directly, even if it is not
// in this list.
export interface Ticker {
  code: string;
  name: string;
  sector: string;
}

export const TICKERS: Ticker[] = [
  { code: "BBCA", name: "Bank Central Asia Tbk.", sector: "Perbankan" },
  { code: "BBRI", name: "Bank Rakyat Indonesia (Persero) Tbk.", sector: "Perbankan" },
  { code: "BBNI", name: "Bank Negara Indonesia (Persero) Tbk.", sector: "Perbankan" },
  { code: "BMRI", name: "Bank Mandiri (Persero) Tbk.", sector: "Perbankan" },
  { code: "BRIS", name: "Bank Syariah Indonesia Tbk.", sector: "Perbankan" },
  { code: "TLKM", name: "Telkom Indonesia (Persero) Tbk.", sector: "Telekomunikasi" },
  { code: "ASII", name: "Astra International Tbk.", sector: "Otomotif" },
  { code: "UNVR", name: "Unilever Indonesia Tbk.", sector: "Consumer Goods" },
  { code: "ICBP", name: "Indofood CBP Sukses Makmur Tbk.", sector: "Consumer Goods" },
  { code: "INDF", name: "Indofood Sukses Makmur Tbk.", sector: "Consumer Goods" },
  { code: "GGRM", name: "Gudang Garam Tbk.", sector: "Rokok" },
  { code: "HMSP", name: "H.M. Sampoerna Tbk.", sector: "Rokok" },
  { code: "ADRO", name: "Alamtri Resources Indonesia Tbk.", sector: "Batu Bara" },
  { code: "PTBA", name: "Bukit Asam Tbk.", sector: "Batu Bara" },
  { code: "ITMG", name: "Indo Tambangraya Megah Tbk.", sector: "Batu Bara" },
  { code: "ANTM", name: "Aneka Tambang Tbk.", sector: "Pertambangan" },
  { code: "INCO", name: "Vale Indonesia Tbk.", sector: "Pertambangan" },
  { code: "MDKA", name: "Merdeka Copper Gold Tbk.", sector: "Pertambangan" },
  { code: "PGAS", name: "Perusahaan Gas Negara Tbk.", sector: "Energi" },
  { code: "PGEO", name: "Pertamina Geothermal Energy Tbk.", sector: "Energi" },
  { code: "MEDC", name: "Medco Energi Internasional Tbk.", sector: "Energi" },
  { code: "UNTR", name: "United Tractors Tbk.", sector: "Alat Berat" },
  { code: "SMGR", name: "Semen Indonesia (Persero) Tbk.", sector: "Semen" },
  { code: "INTP", name: "Indocement Tunggal Prakarsa Tbk.", sector: "Semen" },
  { code: "KLBF", name: "Kalbe Farma Tbk.", sector: "Farmasi" },
  { code: "SIDO", name: "Industri Jamu dan Farmasi Sido Muncul Tbk.", sector: "Farmasi" },
  { code: "CPIN", name: "Charoen Pokphand Indonesia Tbk.", sector: "Peternakan" },
  { code: "JPFA", name: "Japfa Comfeed Indonesia Tbk.", sector: "Peternakan" },
  { code: "AMRT", name: "Sumber Alfaria Trijaya Tbk.", sector: "Ritel" },
  { code: "MAPI", name: "Mitra Adiperkasa Tbk.", sector: "Ritel" },
  { code: "ACES", name: "Ace Hardware Indonesia Tbk.", sector: "Ritel" },
  { code: "EXCL", name: "XL Axiata Tbk.", sector: "Telekomunikasi" },
  { code: "ISAT", name: "Indosat Tbk.", sector: "Telekomunikasi" },
  { code: "TOWR", name: "Sarana Menara Nusantara Tbk.", sector: "Infrastruktur" },
  { code: "MTEL", name: "Dayamitra Telekomunikasi Tbk.", sector: "Infrastruktur" },
  { code: "ARTO", name: "Bank Jago Tbk.", sector: "Perbankan" },
  { code: "BBTN", name: "Bank Tabungan Negara (Persero) Tbk.", sector: "Perbankan" },
  { code: "BJTM", name: "Bank Pembangunan Daerah Jawa Timur Tbk.", sector: "Perbankan" },
  { code: "PANI", name: "Pantai Indah Kapuk Dua Tbk.", sector: "Properti" },
  { code: "BSDE", name: "Bumi Serpong Damai Tbk.", sector: "Properti" },
  { code: "CTRA", name: "Ciputra Development Tbk.", sector: "Properti" },
  { code: "SMRA", name: "Summarecon Agung Tbk.", sector: "Properti" },
  { code: "PWON", name: "Pakuwon Jati Tbk.", sector: "Properti" },
  { code: "GOTO", name: "GoTo Gojek Tokopedia Tbk.", sector: "Teknologi" },
  { code: "BUKA", name: "Bukalapak.com Tbk.", sector: "Teknologi" },
  { code: "EMTK", name: "Elang Mahkota Teknologi Tbk.", sector: "Teknologi" },
  { code: "MYOR", name: "Mayora Indah Tbk.", sector: "Consumer Goods" },
  { code: "ULTJ", name: "Ultra Jaya Milk Industry Tbk.", sector: "Consumer Goods" },
  { code: "CMRY", name: "Cisarua Mountain Dairy Tbk.", sector: "Consumer Goods" },
  { code: "AKRA", name: "AKR Corporindo Tbk.", sector: "Perdagangan" },
  { code: "SRTG", name: "Saratoga Investama Sedaya Tbk.", sector: "Investasi" },
  { code: "BRPT", name: "Barito Pacific Tbk.", sector: "Kimia" },
  { code: "TPIA", name: "Chandra Asri Petrochemical Tbk.", sector: "Kimia" },
  { code: "AVIA", name: "Avia Avian Tbk.", sector: "Industri Dasar" },
  { code: "AMMN", name: "Amman Mineral Internasional Tbk.", sector: "Pertambangan" },
  { code: "BRMS", name: "Bumi Resources Minerals Tbk.", sector: "Pertambangan" },
  { code: "BUMI", name: "Bumi Resources Tbk.", sector: "Batu Bara" },
];

// Used when WATCHLIST_CODES isn't set — a reasonable starting point of
// large, liquid IDX stocks, not a personalized pick. Override with the
// WATCHLIST_CODES env var (comma-separated codes) any time. Kept in sync
// with DEFAULT_WATCHLIST in scripts/fetch_stockbit_daily.py.
export const DEFAULT_WATCHLIST = [
  "BBCA", "BBRI", "BMRI", "BBNI", "TLKM",
  "ASII", "GOTO", "ADRO", "ANTM", "ICBP",
];

export function findTicker(code: string): Ticker | undefined {
  return TICKERS.find((t) => t.code === code.toUpperCase());
}

export function searchTickers(query: string, limit = 10): Ticker[] {
  const q = query.trim().toUpperCase();
  if (!q) return TICKERS.slice(0, limit);
  return TICKERS.filter(
    (t) => t.code.includes(q) || t.name.toUpperCase().includes(q)
  ).slice(0, limit);
}
