export class StockbitAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StockbitAuthError";
  }
}

export class StockbitUnavailableError extends Error {
  constructor(message: string, readonly cause_?: unknown) {
    super(message);
    this.name = "StockbitUnavailableError";
  }
}

export interface BrokerRow {
  rank: number;
  brokerCode: string;
  brokerName: string;
  value: number;
  lot: number;
  avgPrice: number;
}

export interface BrokerDistribution {
  code: string;
  buy: BrokerRow[];
  sell: BrokerRow[];
}
