# Debugging Job Trigger Issues

## Overview

This document explains how to trace why a job is not triggering. Comprehensive logging has been added at every step of the job dispatch and processing flow.

## Log Flow Sequence

When you trigger a post approval job, you should see logs in this order:

### 1. API Controller (PostsController)

**Look for:**

```
[POSTS_CONTROLLER] Dispatching post approval job for post e4765358-46e1-4290-a09d-aa5b4c4770a2
[POSTS_CONTROLLER] Job data: {...}
[POSTS_CONTROLLER] Job dispatcher created, calling dispatch()...
[POSTS_CONTROLLER] Post approval job dispatched successfully for post e4765358-46e1-4290-a09d-aa5b4c4770a2
```

**If missing:** The API endpoint is not being called or there's an error before dispatch.

### 2. BaseJob Static Dispatch

**Look for:**

```
[BASE_JOB] Static dispatch called for PostApprovalJob
[BASE_JOB] JobDispatcher is initialized for PostApprovalJob
[BASE_JOB] Job type resolved: post-approval for PostApprovalJob
[BASE_JOB] Job data: {...}
```

**If missing:** The static dispatch method is not being called or job type is not defined.

**If error:** Check if `@RegisterJob('post-approval')` decorator is present on `PostApprovalJob`.

### 3. JobDispatcher Class

**Look for:**

```
[JOB_DISPATCHER_CLASS] Dispatching job type: post-approval
[JOB_DISPATCHER_CLASS] Job data: {...}
[JOB_DISPATCHER_CLASS] Job options: {...}
[JOB_DISPATCHER_CLASS] Successfully dispatched job type: post-approval
```

**If missing:** The JobDispatcher instance is not calling dispatch().

### 4. JobDispatcherService

**Look for:**

```
[JOB_DISPATCHER] Dispatching job of type: post-approval
[JOB_DISPATCHER] Job data: {...}
[JOB_DISPATCHER] Job options: {...}
[JOB_DISPATCHER] Successfully dispatched job of type: post-approval, job ID: <job-id>
```

**If missing:** The service is not being called or there's an error.

### 5. QueueManagerService

**Look for:**

```
[QUEUE_MANAGER] Adding job to queue: post-approval
[QUEUE_MANAGER] Job data: {...}
[QUEUE_MANAGER] Job options: {...}
[QUEUE_MANAGER] Successfully added job to queue: post-approval, job ID: <job-id>
[QUEUE_MANAGER] Job <job-id> is now in queue and will be processed by QueueProcessorService
```

**If missing:** The job is not being added to the queue (Redis/Bull issue).

**If error:** Check Redis connection and Bull queue configuration.

### 6. QueueProcessorService (Job Processing)

**Look for:**

```
[QUEUE] Processing job <job-id> of type: post-approval (attempt 1)
[QUEUE] Job data: {...}
[QUEUE] Available registered jobs: post-approval, generic-llm-processing, ...
[QUEUE] ✅ Found handler for job post-approval, calling handler.handle()...
```

**If missing:** The queue processor is not picking up the job.

**Possible reasons:**

- Queue processor is not running
- Job is stuck in queue
- CPU throttling is blocking the job

**If error "No handler registered":**

- Check if `PostApprovalJob` is registered in `JobRegistry`
- Check if `JobsModule` is properly imported
- Check if `JobAutoLoaderService` has loaded the job

### 7. BaseJob.handle()

**Look for:**

```
[PostApprovalJob] ========== HANDLING JOB ==========
[PostApprovalJob] Job ID: <job-id>
[PostApprovalJob] Job type: post-approval
[PostApprovalJob] Job data: {...}
[PostApprovalJob] Calling process() method...
```

**If missing:** The job handler is not being called.

### 8. PostApprovalJob.process()

**Look for:**

```
🚀 [POST_APPROVAL] ========== STARTING POST APPROVAL JOB ==========
🚀 [POST_APPROVAL] Starting approval process for post e4765358-46e1-4290-a09d-aa5b4c4770a2
🚀 [POST_APPROVAL] Job data: {...}
```

**If missing:** The job process method is not being called.

### 9. GenericLLMProcessingJob.process()

**Look for:**

```
🚀 [GENERIC_LLM_PROCESSING] ========== STARTING GENERIC LLM PROCESSING ==========
🚀 [GENERIC_LLM_PROCESSING] Starting processing for post e4765358-46e1-4290-a09d-aa5b4c4770a2
[GENERIC_LLM_PROCESSING] Step 1: Loading post entity with ID: e4765358-46e1-4290-a09d-aa5b4c4770a2
[GENERIC_LLM_PROCESSING] ✅ Successfully loaded post entity
[GENERIC_LLM_PROCESSING] Step 2: Getting processing policy for post
[GENERIC_LLM_PROCESSING] ✅ Got processing policy: post
[GENERIC_LLM_PROCESSING] Step 4: Extracting content from post
[GENERIC_LLM_PROCESSING] ✅ Extracted content (length: XXX chars)
[GENERIC_LLM_PROCESSING] Step 7: Creating LLM client and calling LLM
[GENERIC_LLM_PROCESSING] AI Provider: Crumplete AI (ollama) (29779ca1-cd3a-4ab5-9959-09f59cf918d5)
[GENERIC_LLM_PROCESSING] Model: llama3.3:70b
[GENERIC_LLM_PROCESSING] Temperature: 0.1
[GENERIC_LLM_PROCESSING] ✅ LLM client created
[GENERIC_LLM_PROCESSING] Calling LLM extraction service...
```

**If missing:** The generic LLM processing job is not being called.

## Common Issues and Solutions

### Issue 1: Job Not Added to Queue

**Symptoms:**

- Logs stop at `[POSTS_CONTROLLER]` or `[JOB_DISPATCHER]`
- No `[QUEUE_MANAGER]` logs

**Solutions:**

- Check Redis connection
- Check Bull queue configuration
- Check if queue is paused

### Issue 2: Job Added but Not Processed

**Symptoms:**

- See `[QUEUE_MANAGER]` logs but no `[QUEUE]` logs

**Solutions:**

- Check if `QueueProcessorService` is running
- Check queue concurrency settings
- Check CPU throttling
- Check if job is stuck in queue (use Bull dashboard)

### Issue 3: No Handler Registered

**Symptoms:**

- See `[QUEUE]` logs with error: "No handler registered for job type: post-approval"

**Solutions:**

- Check if `PostApprovalJob` is registered in `JobRegistry`
- Check if `JobsModule` imports `PostsJobsModule`
- Check if `JobAutoLoaderService` has loaded the job
- Restart the backend to reload jobs

### Issue 4: Job Handler Not Called

**Symptoms:**

- See `[QUEUE] ✅ Found handler` but no `[PostApprovalJob]` logs

**Solutions:**

- Check if `handler.handle()` is being called
- Check for errors in job handler initialization
- Check job data structure matches expected interface

## How to Check Logs

### Option 1: Watch Backend Logs in Real-Time

```bash
# If using npm/yarn
npm run dev:backend | grep -E "\[POSTS_CONTROLLER\]|\[BASE_JOB\]|\[JOB_DISPATCHER\]|\[QUEUE_MANAGER\]|\[QUEUE\]|\[POST_APPROVAL\]|\[GENERIC_LLM_PROCESSING\]"

# Or watch all logs
tail -f backend.log | grep -E "POSTS_CONTROLLER|BASE_JOB|JOB_DISPATCHER|QUEUE_MANAGER|QUEUE|POST_APPROVAL|GENERIC_LLM"
```

### Option 2: Check Recent Logs

```bash
# Check last 100 lines for job-related logs
tail -100 backend.log | grep -E "POSTS_CONTROLLER|BASE_JOB|JOB_DISPATCHER|QUEUE_MANAGER|QUEUE|POST_APPROVAL|GENERIC_LLM"
```

### Option 3: Search for Specific Post ID

```bash
# Search for logs related to specific post
grep "e4765358-46e1-4290-a09d-aa5b4c4770a2" backend.log | tail -50
```

## Testing the Flow

1. **Trigger the job:**

   ```bash
   curl 'http://localhost:3001/api/posts/e4765358-46e1-4290-a09d-aa5b4c4770a2/approve' \
     -H 'Authorization: Bearer <token>' \
     -H 'Content-Type: application/json' \
     --data-raw '{"model":"llama3.3:70b","promptId":"f6f4fdbd-df4f-4fd0-a1ba-4d234dd9478b","temperature":0.1,"aiProviderId":"29779ca1-cd3a-4ab5-9959-09f59cf918d5"}'
   ```

2. **Watch logs immediately:**

   ```bash
   tail -f backend.log | grep -E "POSTS_CONTROLLER|BASE_JOB|JOB_DISPATCHER|QUEUE_MANAGER|QUEUE|POST_APPROVAL|GENERIC_LLM"
   ```

3. **Check each step:**
   - ✅ API Controller logs
   - ✅ BaseJob dispatch logs
   - ✅ JobDispatcher logs
   - ✅ QueueManager logs
   - ✅ QueueProcessor logs
   - ✅ Job handler logs
   - ✅ PostApprovalJob logs
   - ✅ GenericLLMProcessingJob logs

## Expected Complete Log Sequence

```
[POSTS_CONTROLLER] Dispatching post approval job for post e4765358-46e1-4290-a09d-aa5b4c4770a2
[BASE_JOB] Static dispatch called for PostApprovalJob
[BASE_JOB] Job type resolved: post-approval
[JOB_DISPATCHER_CLASS] Dispatching job type: post-approval
[JOB_DISPATCHER] Dispatching job of type: post-approval
[QUEUE_MANAGER] Adding job to queue: post-approval
[QUEUE_MANAGER] Successfully added job to queue: post-approval, job ID: 123
[QUEUE] Processing job 123 of type: post-approval
[QUEUE] ✅ Found handler for job post-approval
[PostApprovalJob] ========== HANDLING JOB ==========
🚀 [POST_APPROVAL] ========== STARTING POST APPROVAL JOB ==========
🚀 [GENERIC_LLM_PROCESSING] ========== STARTING GENERIC LLM PROCESSING ==========
```

If any step is missing, that's where the issue is!
