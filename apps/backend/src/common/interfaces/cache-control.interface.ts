export interface CacheControl {
  enabled?: boolean; // Whether to use cache at all
  ttl?: number; // Custom TTL for this specific request
  forceRefresh?: boolean; // Force refresh the cache
}
