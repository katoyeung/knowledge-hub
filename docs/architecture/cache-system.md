# Cache System Architecture

## Overview

The system implements a multi-layer caching strategy using Redis to optimize performance and reduce API calls. The caching system follows a hierarchical approach with three main layers.

## Cache Layers

### 1. Indicator Result Layer (First Layer)

- **Purpose**: Caches the final computed indicator results
- **Key Pattern**: `indicator_result:{indicatorId}:{instrumentId}`
- **TTL**: Until next trading day open
- **Implementation**: `IndicatorSyncService.getCachedIndicatorResult()`

### 2. Indicator Layer (Second Layer)

- **Purpose**: Caches individual indicator computations
- **Key Patterns**:
  ```typescript
  CACHE_KEYS.INDICATOR = {
    EARNINGS: 'indicator:earnings_call',
    QUALITY: 'indicator:quality_score',
    VALUE: 'indicator:value_metrics',
    GROWTH: 'indicator:growth_metrics',
    MOVING_AVERAGE: 'indicator:moving_average',
    NEWS_ANALYSIS: 'indicator:news_analysis',
    RESULT: 'indicator:result',
  };
  ```
- **TTL by Indicator Type**:
  - Value Indicator: Until next trading day EOD
  - Quality Indicator: Until next trading day EOD
  - Growth Indicator: Until next trading day EOD
  - Moving Average: Until next trading day EOD
  - News Analysis: Until next trading day open
  - Earnings Call: Dynamic based on next earnings date
  - Industry Comparison: 1 hour (3,600,000 ms)

### 3. API Layer (Third Layer)

- **Purpose**: Caches external API responses
- **Key Pattern**: `{apiClient}:{endpoint}:{params}`
- **TTL by API Type**:
  - EODHD API: Configurable via `EODHD_CACHE_TTL` env var (default: 0 - never expire)
  - Perplexity API: Configurable via `PERPLEXITY_CACHE_TTL` env var (default: 0 - never expire)
  - OpenRouter API: No caching (TTL: 0)
  - Base API Client: 1 hour (3,600,000 ms)

### 4. Market Data Layer

- **Purpose**: Caches market data responses
- **Key Pattern**: `market:{type}:{symbol}`
- **TTL by Data Type**:
  - Real-time Market Data: 15 minutes (900,000 ms)
  - Historical Market Data: Until next trading day

### 5. Authentication Layer

- **Purpose**: Caches user authentication data
- **Key Pattern**: `user:profile:{userId}`
- **TTL**: Configurable via `CACHE_TTL` env var (default: 1 hour - 3,600,000 ms)

## Cache Validation Testing

### Test Scenario: Instrument Addition and Sync

1. **Add New Instrument**

   ```bash
   # Add instrument through API
   curl -X POST /api/instruments -d '{"symbol": "AAPL.US"}'
   ```

2. **Trigger Events**

   - `instrument.created` event fires
   - Sync screener job triggers
   - New instrument syncs with indicators

3. **Verify Frontend**

   - Check updated prices
   - Verify indicator values are displayed
   - Confirm all data is current

4. **Test Cache Persistence**

   ```sql
   -- Remove indicator results from DB
   DELETE FROM indicator_results WHERE instrument_id = 116;
   ```

   - Frontend should show "N/A" for indicators
   - Cache should still exist in Redis

5. **Wait for Cron Job**

   - Wait 5 minutes for sync job
   - System checks cache existence
   - Frontend remains "N/A"

6. **Clear Cache**

   ```bash
   # Remove indicator result cache
   redis-cli --raw KEYS "indicator_result:*:116" | xargs -L 1 redis-cli DEL
   ```

7. **Trigger Update**

   - System detects missing cache
   - Triggers indicator result update
   - Recomputes and caches new results

8. **Verify Frontend**
   - Check frontend displays updated values
   - Confirm cache is properly populated

## Cache Management

### Clearing Cache

```bash
# Clear specific indicator results
redis-cli --raw KEYS "indicator_result:*:116" | xargs -L 1 redis-cli DEL

# Clear all indicator caches for a symbol
redis-cli --raw KEYS "indicator:*:AAPL.US" | xargs -L 1 redis-cli DEL

# Clear market data cache
redis-cli --raw KEYS "market:realtime:*" | xargs -L 1 redis-cli DEL

# Clear all caches
redis-cli FLUSHALL
```

### Cache Monitoring

```bash
# List all cache keys
redis-cli KEYS "*"

# Get cache TTL
redis-cli TTL "indicator_result:1:116"

# Get cache value
redis-cli GET "indicator_result:1:116"
```

## Implementation Details

### Indicator Result Caching

```typescript
// In IndicatorSyncService
private async getCachedIndicatorResult(
  indicatorId: number,
  instrumentId: number,
  forceRefresh = false,
): Promise<IndicatorResult | null> {
  const cacheKey = `${CACHE_KEYS.INDICATOR.RESULT}:${indicatorId}:${instrumentId}`;
  if (forceRefresh) {
    await this.cacheManager.del(cacheKey);
    return null;
  }
  return await this.cacheManager.get<IndicatorResult>(cacheKey);
}
```

### Individual Indicator Caching

```typescript
// Example from ValueIndicator
@Cacheable({
  keyPrefix: CACHE_KEYS.INDICATOR.VALUE,
  keyGenerator: (symbol: string) => `${CACHE_KEYS.INDICATOR.VALUE}:${symbol}`,
  ttl: () => getNextTradingDayTTL(MarketTimeType.EOD),
  shouldRefresh: (data: any) => data.forceRefresh || false,
})
```

## Best Practices

1. **Cache Key Naming**

   - Use `CACHE_KEYS` constant for consistency
   - Follow pattern: `{module}:{entity}:{identifier}`
   - Use colon (:) as separator

2. **Cache Invalidation**

   - Use appropriate TTL based on data type
   - Implement force refresh option
   - Clear cache on data updates

3. **Error Handling**

   - Implement fallback to database on cache miss
   - Log cache errors for monitoring
   - Handle cache connection failures gracefully

4. **Performance**
   - Use appropriate TTL values
   - Implement cache warming for critical data
   - Monitor cache hit/miss ratios
