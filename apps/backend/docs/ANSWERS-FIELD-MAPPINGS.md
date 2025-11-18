# Answers to Your Questions

## Question 1: Why is the record not changing?

The post status is not being updated because one of these reasons:

### Possible Causes:

1. **Job Not Processing**

   - The job is queued but not being processed
   - Check backend logs for: `🚀 [POST_APPROVAL] Starting approval process`
   - Queue might be paused or jobs are failing silently

2. **LLM Result Structure Mismatch**

   - The LLM returns a different structure than expected
   - Expected: `{ status: "approved", reason: "...", confidenceScore: 0.9 }`
   - If LLM returns different field names, mappings won't work

3. **Field Mapping Not Matching**

   - The `status` field in LLM result might be missing or have different value
   - Check logs for: `Raw LLM result for post {id}: {...}`

4. **Transform Function Issue**
   - The transform expects `"approved"` but LLM returns `"Approved"` (case mismatch)
   - Or LLM returns `true/false` instead of `"approved"/"rejected"`

### How to Debug:

1. **Check Backend Logs:**

   ```bash
   tail -f backend.log | grep -E "(POST_APPROVAL|GENERIC_LLM|post-approval|e4765358)"
   ```

2. **Check Job Status:**

   - Look for job completion/failure messages
   - Check if job is stuck in queue

3. **Check LLM Result:**

   - Look for log: `Raw LLM result for post {id}: {...}`
   - Verify it has `status`, `reason`, `confidenceScore` fields

4. **Check Update Data:**

   - Look for log: `Update data after mapping for post {id}: {...}`
   - Verify it contains the fields to update

5. **Check SQL Update:**
   - Look for log: `🔄 Executing UPDATE query: ...`
   - Verify the update is actually executed

## Question 2: How does it know which fields should use?

The system knows which fields to use through **Field Mapping Configuration**:

### Step-by-Step Flow:

1. **Field Mappings Defined in PostApprovalJob:**

   ```typescript
   const fieldMappings: FieldMappingConfig = {
     mappings: {
       status: {
         from: 'decision', // LLM returns "decision", not "status"
         transform: (v) =>
           v === 'approved' ? PostStatus.APPROVED : PostStatus.REJECTED,
       },
       approvalReason: 'reason', // LLM 'reason' → Post 'approvalReason'
       confidenceScore: 'confidenceScore', // Direct mapping
     },
   };
   ```

2. **Field Mappings Passed to GenericLLMProcessingJob:**

   - `PostApprovalJob` passes `fieldMappings` to `GenericLLMProcessingJob`
   - These mappings tell the system:
     - Which LLM result fields to read (`from`)
     - Which Post entity fields to update (mapping key)
     - How to transform values (transform function)

3. **FieldMappingService Applies Mappings:**

   - `FieldMappingService.applyMappings()` reads the LLM result
   - For each mapping:
     - Extracts value from LLM result using `from` path
     - Applies transform if defined
     - Maps to entity field name
   - Returns update object with Post field names

4. **PostResultApplicationStrategy Updates Database:**
   - Uses the update object from `FieldMappingService`
   - Executes: `postRepository.update(entityId, updateData)`

### Example:

**LLM Result:**

```json
{
  "decision": "approved",
  "reason": "Content is appropriate",
  "confidenceScore": 0.95
}
```

**Field Mappings:**

```typescript
{
  status: { from: 'decision', transform: ... },
  approvalReason: 'reason',
  confidenceScore: 'confidenceScore',
}
```

**Update Object Created:**

```json
{
  "status": "approved", // PostStatus enum
  "approvalReason": "Content is appropriate",
  "confidenceScore": 0.95
}
```

**SQL Executed:**

```sql
UPDATE posts
SET status = 'approved',
    approval_reason = 'Content is appropriate',
    confidence_score = 0.95
WHERE id = 'e4765358-46e1-4290-a09d-aa5b4c4770a2'
```

### Key Points:

- **Field mappings are explicit** - defined in `PostApprovalJob`
- **No hardcoding** - mappings can be changed per job type
- **Flexible** - supports transforms, defaults, nested paths
- **Type-safe** - TypeScript ensures correct usage

### Where Field Mappings Are Defined:

1. **PostApprovalJob** (`apps/backend/src/modules/queue/jobs/posts/post-approval.job.ts`):

   - Defines mappings for approval use case
   - Lines 48-70

2. **PostProcessingPolicy** (`apps/backend/src/modules/queue/jobs/llm-processing/policies/post-processing-policy.ts`):

   - Provides default mappings for Post entities
   - Can be overridden by job-specific mappings

3. **FieldMappingService** (`apps/backend/src/modules/queue/jobs/llm-processing/services/field-mapping.service.ts`):
   - Applies the mappings to create update objects
