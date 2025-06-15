export interface ApiClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
  cacheTTL?: number;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

export interface ApiClient {
  get<T>(
    endpoint: string,
    params?: Record<string, any>,
  ): Promise<ApiResponse<T>>;
  post<T>(endpoint: string, data?: any): Promise<ApiResponse<T>>;
}

export interface EodhdApiClient extends ApiClient {
  getInstrumentFundamentals(ticker: string): Promise<ApiResponse<any>>;
  getRealTimeQuote(ticker: string): Promise<ApiResponse<any>>;
  getBulkLastDay(
    exchange: string,
    symbols: string[],
  ): Promise<ApiResponse<any>>;
  getHistoricalData(
    ticker: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<ApiResponse<any>>;
  getIntradayData(
    ticker: string,
    interval: '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d',
  ): Promise<ApiResponse<any>>;
  searchInstruments(
    query: string,
    exchange?: string,
  ): Promise<ApiResponse<any>>;
}
