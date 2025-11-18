# How Field Mappings Work in LLM Processing

## Overview

The field mapping system determines which fields from the LLM result should be mapped to which entity fields. This is configured in `PostApprovalJob` and applied by `FieldMappingService`.

## Field Mapping Flow

### 1. Field Mapping Definition (PostApprovalJob)

```typescript:48:70:apps/backend/src/modules/queue/jobs/posts/post-approval.job.ts
// Define field mappings for approval use case
// Note: LLM returns "decision" field, not "status"
const fieldMappings: FieldMappingConfig = {
  mappings: {
    status: {
      from: 'decision', // LLM returns "decision", not "status"
      transform: (v) =>
        v === 'approved' ? PostStatus.APPROVED : PostStatus.REJECTED,
    },
    approvalReason: 'reason',
    confidenceScore: 'confidenceScore',
  },
  enumConversions: {
    status: {
      approved: PostStatus.APPROVED,
      rejected: PostStatus.REJECTED,
    },
  },
  statusField: 'status',
  statusValues: {
    pending: PostStatus.PENDING,
    error: PostStatus.PENDING, // Keep as pending on error
  },
};
```

**What this means:**

- `status` from LLM result → `status` in Post entity (with transform)
- `reason` from LLM result → `approvalReason` in Post entity
- `confidenceScore` from LLM result → `confidenceScore` in Post entity

### 2. Field Mapping Application (FieldMappingService)

The `FieldMappingService.applyMappings()` method:

1. Extracts values from LLM result using the `from` path
2. Applies transformations if defined
3. Maps to entity field names
4. Handles enum conversions

```typescript:21:62:apps/backend/src/modules/queue/jobs/llm-processing/services/field-mapping.service.ts
applyMappings(result: any, config: FieldMappingConfig): Record<string, any> {
  const update: Record<string, any> = {};

  // Apply defaults first
  if (config.defaults) {
    Object.assign(update, config.defaults);
  }

  // Apply field mappings
  for (const [entityField, mapping] of Object.entries(config.mappings)) {
    try {
      const value = this.extractAndTransformValue(
        result,
        mapping,
        entityField,
      );

      if (value !== undefined && value !== null) {
        // Handle nested field paths (e.g., "meta.field")
        this.setNestedField(update, entityField, value);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to map field ${entityField}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Apply enum conversions if configured
  if (config.enumConversions) {
    for (const [field, conversions] of Object.entries(
      config.enumConversions,
    )) {
      const currentValue = this.getNestedField(update, field);
      if (currentValue !== undefined && conversions[currentValue]) {
        this.setNestedField(update, field, conversions[currentValue]);
      }
    }
  }

  return update;
}
```

### 3. Example: LLM Result → Post Update

**LLM Result:**

```json
{
  "decision": "approved",
  "reason": "Content is appropriate",
  "confidenceScore": 0.95
}
```

**Field Mappings Applied:**

- `result.decision` → `post.status` (transformed: "approved" → `PostStatus.APPROVED`)
- `result.reason` → `post.approvalReason`
- `result.confidenceScore` → `post.confidenceScore`

**Update Object Created:**

```json
{
  "status": "approved", // PostStatus enum value
  "approvalReason": "Content is appropriate",
  "confidenceScore": 0.95
}
```

**SQL Update:**

```sql
UPDATE posts
SET status = 'approved',
    approval_reason = 'Content is appropriate',
    confidence_score = 0.95
WHERE id = 'e4765358-46e1-4290-a09d-aa5b4c4770a2'
```

## How the System Knows Which Fields to Use

1. **Job Definition** (`PostApprovalJob`):

   - Defines field mappings for the approval use case
   - Specifies which LLM result fields map to which Post fields

2. **Policy Defaults** (`PostProcessingPolicy`):

   - Provides default field mappings for Post entities
   - Can be overridden by job-specific mappings

3. **Merging Logic** (`GenericLLMProcessingJob.mergeFieldMappings`):

   - Merges default mappings from policy with job-specific mappings
   - Job-specific mappings take precedence

4. **Application** (`PostResultApplicationStrategy`):
   - Uses `FieldMappingService` to apply mappings
   - Creates update object with entity field names
   - Executes database update

## Troubleshooting: Why Post Status Not Updating

### Check 1: Is the Job Running?

Check backend logs for:

- `🚀 [POST_APPROVAL] Starting approval process`
- `[GENERIC_LLM_PROCESSING] Starting processing`
- `Applying LLM result to post`

### Check 2: LLM Result Structure

The LLM must return a result with these fields:

- `status`: "approved" or "rejected"
- `reason`: string (optional)
- `confidenceScore`: number (optional)

If the LLM returns a different structure, the mappings won't work.

### Check 3: Field Mapping Logs

Look for these log messages:

- `Raw LLM result for post {id}: {...}`
- `Update data after mapping for post {id}: {...}`
- `🔄 Executing UPDATE query: ...`
- `✅ Successfully applied result to post {id}`

### Check 4: Database Update

Verify the update actually happened:

```sql
SELECT id, status, approval_reason, confidence_score
FROM posts
WHERE id = 'e4765358-46e1-4290-a09d-aa5b4c4770a2';
```

## Common Issues

### Issue 1: LLM Result Structure Mismatch

**Problem:** LLM returns `{ "status": "approved" }` but mapping expects `{ "decision": "approved" }`

**Solution:** Update field mappings:

```typescript
mappings: {
  status: {
    from: 'status',  // Changed from 'decision' if LLM returns "status"
    transform: (v) => v === 'approved' ? PostStatus.APPROVED : PostStatus.REJECTED,
  },
}
```

**Note:** The current implementation expects `decision` field from LLM, but if your LLM returns `status`, update the mapping accordingly.

### Issue 2: Case Sensitivity

**Problem:** LLM returns `"Approved"` but transform checks for `"approved"`

**Solution:** Make transform case-insensitive:

```typescript
transform: (v) => {
  const lower = String(v).toLowerCase();
  return lower === 'approved' ? PostStatus.APPROVED : PostStatus.REJECTED;
};
```

### Issue 3: Missing Fields

**Problem:** LLM doesn't return `confidenceScore`, so it's not updated

**Solution:** Use defaults:

```typescript
mappings: {
  confidenceScore: {
    from: 'confidenceScore',
    defaultValue: 0.5,  // Use default if missing
  },
}
```
