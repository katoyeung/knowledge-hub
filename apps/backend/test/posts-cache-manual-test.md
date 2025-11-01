# Manual Cache Verification Guide

## Quick Verification Steps

### 1. Start Redis and Backend

```bash
# Terminal 1: Start Redis (if not running)
redis-server

# Terminal 2: Start Backend
cd apps/backend
npm run dev
```

### 2. Check Cache Logs

Look for these log messages in the backend console:

```
[PostsService] Posts hash cache TTL set to 30 days (2592000000ms)
[PostsService] Cache hit for hash: {hash}
[PostsService] Cache miss for hash: {hash}, querying database
[PostsService] Cached hash: {hash} with TTL: 2592000000ms
```

### 3. Test via API

#### Step 1: Create a Post (Should Cache)

```bash
curl -X POST http://localhost:3001/posts \
  -H "Content-Type: application/json" \
  -d '{
    "hash": "test-hash-manual-001",
    "title": "Test Post",
    "provider": "manual-test",
    "source": "test",
    "meta": {"content": "Test content"}
  }'
```

**Expected**: Check backend logs - should see "Cached newly created post hash"

#### Step 2: Query by Hash (Should Use Cache)

```bash
curl http://localhost:3001/posts/by-hash/test-hash-manual-001
```

**Expected**:

- First call: "Cache miss" → queries DB → caches result
- Second call: "Cache hit" → returns from cache (no DB query)

#### Step 3: Check Redis Directly

```bash
redis-cli

# Check if key exists
EXISTS posts:hash:test-hash-manual-001

# Get the cached value
GET posts:hash:test-hash-manual-001

# Check TTL (should be around 2592000 seconds = 30 days)
TTL posts:hash:test-hash-manual-001
```

### 4. Verify Upsert Updates Cache

```bash
curl -X POST http://localhost:3001/posts/upsert \
  -H "Content-Type: application/json" \
  -d '{
    "hash": "test-hash-manual-001",
    "title": "Updated Title",
    "provider": "manual-test"
  }'
```

**Expected**: Backend logs should show "Updated cache for hash"

### 5. Verify Delete Invalidates Cache

```bash
# First get the post ID from previous responses
curl -X DELETE http://localhost:3001/posts/{post-id}
```

**Expected**:

- Check Redis: Key should be deleted
- Backend logs: "Invalidated cache for hash"

## Automated Verification Script

Save this as `verify-cache.sh`:

```bash
#!/bin/bash

API_URL="http://localhost:3001"
HASH="verify-cache-$(date +%s)"

echo "🧪 Testing Posts Cache Functionality"
echo "===================================="

# 1. Create post
echo "1. Creating post with hash: $HASH"
RESPONSE=$(curl -s -X POST "$API_URL/posts" \
  -H "Content-Type: application/json" \
  -d "{\"hash\":\"$HASH\",\"title\":\"Cache Test\",\"meta\":{\"test\":true}}")
echo "Response: $RESPONSE"

# 2. Check Redis
echo ""
echo "2. Checking Redis for cached key..."
redis-cli EXISTS "posts:hash:$HASH" && echo "✅ Key exists in Redis" || echo "❌ Key NOT in Redis"

# 3. Query by hash (should hit cache on 2nd call)
echo ""
echo "3. Querying by hash (first call - cache miss expected)..."
curl -s "$API_URL/posts/by-hash/$HASH" > /dev/null
echo "First query complete"

echo ""
echo "4. Querying by hash (second call - cache hit expected)..."
curl -s "$API_URL/posts/by-hash/$HASH" > /dev/null
echo "Second query complete"

# 4. Check TTL
echo ""
echo "5. Checking TTL..."
TTL=$(redis-cli TTL "posts:hash:$HASH")
if [ "$TTL" -gt 0 ]; then
  DAYS=$((TTL / 86400))
  echo "✅ TTL set: $TTL seconds (~$DAYS days)"
else
  echo "❌ TTL not set or key expired"
fi

echo ""
echo "✅ Cache verification complete!"
```

Make it executable and run:

```bash
chmod +x verify-cache.sh
./verify-cache.sh
```

## Expected Behavior

1. **Create**: Post created → Immediately cached in Redis
2. **Read (First)**: Cache miss → Query DB → Cache result
3. **Read (Second)**: Cache hit → Return from Redis (fast!)
4. **Update**: Post updated → Cache updated with new data
5. **Delete**: Post deleted → Cache invalidated (key removed)

## Troubleshooting

### Cache Not Working?

1. **Check Redis Connection**:

   ```bash
   redis-cli PING
   # Should return: PONG
   ```

2. **Check Environment Variables**:

   ```bash
   echo $REDIS_HOST
   echo $REDIS_PORT
   echo $POSTS_HASH_CACHE_TTL_DAYS
   ```

3. **Check Backend Logs**:

   - Look for cache initialization message
   - Check for cache error messages
   - Verify cache operations are being logged

4. **Check Cache Module Import**:
   - Verify `CacheModule` is imported in `PostsModule`
   - Verify `CACHE_MANAGER` is injected in `PostsService`

### Cache Keys Not Found?

- Keys are prefixed with `posts:hash:`
- Hash must match exactly
- TTL might have expired (default 30 days)

### Performance Verification

Compare response times:

```bash
# First call (cache miss)
time curl -s "$API_URL/posts/by-hash/$HASH" > /dev/null

# Second call (cache hit - should be faster)
time curl -s "$API_URL/posts/by-hash/$HASH" > /dev/null
```

Cache hit should be significantly faster (milliseconds vs database query).
