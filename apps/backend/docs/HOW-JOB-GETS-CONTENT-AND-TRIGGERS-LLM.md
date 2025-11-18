# How Job Gets Content and Triggers LLM

## Complete Flow Overview

```
PostApprovalJob
  ↓
GenericLLMProcessingJob
  ↓
1. Load Post Entity
  ↓
2. Extract Content (PostContentExtractionStrategy)
  ↓
3. Extract Template Variables
  ↓
4. Get Prompt from Database
  ↓
5. Build User Prompt (replace template variables)
  ↓
6. Call LLM (LLMExtractionService.extractWithLLM)
  ↓
7. Parse JSON Response
  ↓
8. Apply Result to Post
```

## Step-by-Step Flow

### Step 1: Job Entry Point

**File:** `apps/backend/src/modules/queue/jobs/posts/post-approval.job.ts`

```typescript:41:82:apps/backend/src/modules/queue/jobs/posts/post-approval.job.ts
async process(data: PostApprovalJobData): Promise<void> {
  const { postId, promptId, aiProviderId, model, temperature, userId } = data;

  this.logger.log(
    `🚀 [POST_APPROVAL] Starting approval process for post ${postId}`,
  );

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
    // ... more config
  };

  // Delegate to generic LLM processing job
  await this.genericLLMProcessingJob.process({
    entityType: 'post',
    entityId: postId,
    promptId,
    aiProviderId,
    model,
    temperature,
    userId,
    fieldMappings,
  });
}
```

### Step 2: Load Post Entity

**File:** `apps/backend/src/modules/queue/jobs/llm-processing/generic-llm-processing.job.ts`

```typescript:98:104:apps/backend/src/modules/queue/jobs/llm-processing/generic-llm-processing.job.ts
// Step 1: Load entity by type and ID
const entity = await this.loadEntity(entityType, entityId);
if (!entity) {
  throw new NotFoundException(
    `${entityType} with ID ${entityId} not found`,
  );
}
```

**What happens:**

- Queries database: `SELECT * FROM posts WHERE id = 'e4765358-46e1-4290-a09d-aa5b4c4770a2'`
- Returns full Post entity with all fields: `id`, `title`, `meta`, `source`, `provider`, etc.

### Step 3: Extract Content from Post

**File:** `apps/backend/src/modules/queue/jobs/llm-processing/strategies/post-content-extraction-strategy.ts`

```typescript:17:52:apps/backend/src/modules/queue/jobs/llm-processing/strategies/post-content-extraction-strategy.ts
extractContent(post: Post): string {
  const parts: string[] = [];

  if (post.title) {
    parts.push(`Title: ${post.title}`);
  }

  if (post.meta?.content) {
    parts.push(`Content: ${post.meta.content}`);
  }

  if (post.source) {
    parts.push(`Source: ${post.source}`);
  }

  if (post.provider) {
    parts.push(`Provider: ${post.provider}`);
  }

  if (post.postedAt) {
    parts.push(`Posted At: ${post.postedAt.toISOString()}`);
  }

  // Add any other relevant meta fields
  if (post.meta) {
    const metaFields = Object.entries(post.meta)
      .filter(([key]) => key !== 'content')
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);

    if (metaFields.length > 0) {
      parts.push(`Additional Metadata:\n${metaFields.join('\n')}`);
    }
  }

  return parts.join('\n\n');
}
```

**What happens:**

- Extracts specific fields from Post entity
- Formats them into a readable string
- **Example output:**

  ```
  Title: 老豆開礦？錢，自己印？幫洗？

  Content: [post content from meta.content]

  Source: test
  Provider: test
  Posted At: 2025-11-04T08:41:28.340Z

  Additional Metadata:
  author: "user123"
  platform: "discord"
  ```

### Step 4: Extract Template Variables

**File:** `apps/backend/src/modules/queue/jobs/llm-processing/strategies/post-content-extraction-strategy.ts`

```typescript:58:95:apps/backend/src/modules/queue/jobs/llm-processing/strategies/post-content-extraction-strategy.ts
extractTemplateVariables(post: Post): Record<string, string> {
  const variables: Record<string, string> = {};

  if (post.title) {
    variables.title = post.title;
  }

  if (post.source) {
    variables.source = post.source;
  }

  if (post.provider) {
    variables.provider = post.provider;
  }

  if (post.postedAt) {
    variables.postedAt = post.postedAt.toISOString();
    variables.date = post.postedAt.toISOString();
  }

  // Extract common meta fields as template variables
  if (post.meta) {
    if (post.meta.content) {
      variables.content = post.meta.content;
    }
    if (post.meta.author) {
      variables.author = String(post.meta.author);
    }
    if (post.meta.platform) {
      variables.platform = String(post.meta.platform);
    }
    if (post.meta.engagement) {
      variables.engagement = String(post.meta.engagement);
    }
  }

  return variables;
}
```

**What happens:**

- Extracts key fields as template variables
- **Example output:**
  ```json
  {
    "title": "老豆開礦？錢，自己印？幫洗？",
    "source": "test",
    "provider": "test",
    "postedAt": "2025-11-04T08:41:28.340Z",
    "date": "2025-11-04T08:41:28.340Z",
    "content": "[post content]",
    "author": "user123",
    "platform": "discord"
  }
  ```

**Used in GenericLLMProcessingJob:**

```typescript:121:127:apps/backend/src/modules/queue/jobs/llm-processing/generic-llm-processing.job.ts
// Step 5: Extract template variables from entity and merge with additional ones
const entityTemplateVariables =
  contentExtractionStrategy.extractTemplateVariables(entity);
const allTemplateVariables = {
  ...entityTemplateVariables,
  ...additionalTemplateVariables,
};
```

### Step 5: Get Prompt from Database

**File:** `apps/backend/src/modules/queue/jobs/llm-processing/generic-llm-processing.job.ts`

```typescript:129:133:apps/backend/src/modules/queue/jobs/llm-processing/generic-llm-processing.job.ts
// Step 6: Get prompt and AI provider
const prompt = await this.promptService.findPromptById(promptId);
if (!prompt) {
  throw new NotFoundException(`Prompt with ID ${promptId} not found`);
}
```

**What happens:**

- Queries database: `SELECT * FROM prompts WHERE id = 'f6f4fdbd-df4f-4fd0-a1ba-4d234dd9478b'`
- Returns Prompt entity with:
  - `systemPrompt`: System message for LLM
  - `userPromptTemplate`: Template with placeholders like `{{content}}`, `{{title}}`, etc.
  - `jsonSchema`: Expected JSON structure for response

**Example Prompt:**

```json
{
  "id": "f6f4fdbd-df4f-4fd0-a1ba-4d234dd9478b",
  "name": "Detect Social Media Post",
  "systemPrompt": "You are an expert content moderator...",
  "userPromptTemplate": "Analyze the following social media post:\n\n{{content}}\n\nTitle: {{title}}\nSource: {{source}}\n\nDetermine if this post should be approved or rejected.",
  "jsonSchema": {
    "type": "object",
    "properties": {
      "status": { "type": "string", "enum": ["approved", "rejected"] },
      "reason": { "type": "string" },
      "confidenceScore": { "type": "number" }
    }
  }
}
```

### Step 6: Build User Prompt (Fill Template Variables)

**File:** `apps/backend/src/common/services/llm-extraction.service.ts`

```typescript:84:112:apps/backend/src/common/services/llm-extraction.service.ts
/**
 * Build user prompt from template and content
 */
private buildUserPrompt(
  content: string,
  prompt: Prompt,
  templateVariables?: Record<string, string>,
): string {
  if (!prompt.userPromptTemplate) {
    return content;
  }

  let userPrompt = prompt.userPromptTemplate;

  // Replace standard template variables
  userPrompt = userPrompt
    .replace(/\{\{content\}\}/g, content)
    .replace(/\{\{text\}\}/g, content)
    .replace(/\{\{post\}\}/g, content);

  // Replace custom template variables
  if (templateVariables) {
    for (const [key, value] of Object.entries(templateVariables)) {
      userPrompt = userPrompt.replace(
        new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
        value,
      );
    }
  }

  return userPrompt;
}
```

**What happens:**

1. Takes `userPromptTemplate` from prompt
2. Replaces `{{content}}` with extracted content string
3. Replaces `{{title}}`, `{{source}}`, etc. with template variables
4. **Example transformation:**

   **Template:**

   ```
   Analyze the following social media post:

   {{content}}

   Title: {{title}}
   Source: {{source}}
   ```

   **After replacement:**

   ```
   Analyze the following social media post:

   Title: 老豆開礦？錢，自己印？幫洗？

   Content: [post content]

   Source: test
   Provider: test
   ...

   Title: 老豆開礦？錢，自己印？幫洗？
   Source: test
   ```

### Step 7: Call LLM

**File:** `apps/backend/src/common/services/llm-extraction.service.ts`

```typescript:18:79:apps/backend/src/common/services/llm-extraction.service.ts
async extractWithLLM<T = any>(
  config: LLMExtractionConfig,
  llmClient: LLMClient,
  parseOptions?: JSONParseOptions,
): Promise<LLMExtractionResult<T>> {
  try {
    // Build user prompt with template variables
    const userPrompt = this.buildUserPrompt(
      config.content,
      config.prompt,
      config.templateVariables,
    );

    // Build messages
    const messages: LLMMessage[] = [
      { role: 'system', content: config.prompt.systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    this.logger.log('Calling LLM for extraction...');

    // Call LLM
    const response = await llmClient.chatCompletion(
      messages,
      config.model,
      config.prompt.jsonSchema,
      config.temperature || 0.7,
    );

    if (!response.data?.choices?.[0]?.message?.content) {
      return {
        success: false,
        error: 'No valid response from LLM',
      };
    }

    const content = response.data.choices[0].message.content;

    // Parse JSON from response
    const parsed = this.parseJSONFromResponse<T>(content, parseOptions);

    if (!parsed) {
      return {
        success: false,
        error: 'Failed to parse JSON from LLM response',
        rawContent: content,
      };
    }

    return {
      success: true,
      data: parsed,
      rawContent: content,
    };
  } catch (error) {
    this.logger.error(`LLM extraction failed: ${error.message}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

**What happens:**

1. **Builds messages array:**

   ```typescript
   [
     {
       role: 'system',
       content: 'You are an expert content moderator...',
     },
     {
       role: 'user',
       content: 'Analyze the following social media post:\n\n...',
     },
   ];
   ```

2. **Calls LLM client:**

   ```typescript
   await llmClient.chatCompletion(
     messages,
     'llama3.3:70b', // model
     jsonSchema, // expected JSON structure
     0.1, // temperature
   );
   ```

3. **LLM Client (Ollama) makes HTTP request:**

   ```
   POST http://localhost:11434/api/chat
   {
     "model": "llama3.3:70b",
     "messages": [...],
     "stream": false,
     "format": { "type": "json_schema", "schema": {...} }
   }
   ```

4. **LLM returns response:**

   ```json
   {
     "status": "approved",
     "reason": "Content is appropriate and follows guidelines",
     "confidenceScore": 0.95
   }
   ```

5. **Parse JSON from response:**
   - Handles markdown code blocks (`json ... `)
   - Handles direct JSON
   - Handles text fallback if needed

### Step 8: Apply Result to Post

**File:** `apps/backend/src/modules/queue/jobs/llm-processing/generic-llm-processing.job.ts`

```typescript:166:180:apps/backend/src/modules/queue/jobs/llm-processing/generic-llm-processing.job.ts
if (!extractionResult.success || !extractionResult.data) {
  throw new Error(
    extractionResult.error || 'Failed to get result from LLM',
  );
}

const llmResult = extractionResult.data;

// Step 8: Apply result using policy's result application strategy
const metadata: ProcessingMetadata = {
  userId,
  timestamp: new Date(),
};

await policy.process(entityId, llmResult, fieldMappings, metadata);
```

**What happens:**

- `PostResultApplicationStrategy.applyResult()` is called
- Uses `FieldMappingService` to map LLM result to Post fields
- Updates database: `UPDATE posts SET status='approved', approval_reason='...', confidence_score=0.95 WHERE id=...`

## Summary: How Fields Are Extracted

### 1. Content Extraction (What goes to LLM)

**Strategy:** `PostContentExtractionStrategy.extractContent()`

**Fields extracted:**

- `post.title` → `Title: ...`
- `post.meta.content` → `Content: ...`
- `post.source` → `Source: ...`
- `post.provider` → `Provider: ...`
- `post.postedAt` → `Posted At: ...`
- `post.meta.*` → `Additional Metadata: ...`

**Result:** Formatted string with all relevant post information

### 2. Template Variables (For prompt placeholders)

**Strategy:** `PostContentExtractionStrategy.extractTemplateVariables()`

**Variables extracted:**

- `title`, `source`, `provider`, `postedAt`, `date`
- `content`, `author`, `platform`, `engagement` (from meta)

**Result:** Object with key-value pairs for template replacement

### 3. Prompt Template Filling

**Service:** `LLMExtractionService.buildUserPrompt()`

**Process:**

1. Takes `prompt.userPromptTemplate` (e.g., `"Analyze: {{content}}"`)
2. Replaces `{{content}}` with extracted content string
3. Replaces `{{title}}`, `{{source}}`, etc. with template variables
4. Returns final user prompt string

### 4. LLM Call

**Service:** `LLMExtractionService.extractWithLLM()`

**Process:**

1. Builds messages: `[{role: 'system', ...}, {role: 'user', ...}]`
2. Calls `llmClient.chatCompletion()` with:
   - Messages
   - Model name
   - JSON schema (expected response structure)
   - Temperature
3. Parses JSON from LLM response
4. Returns structured result

## Key Points

1. **Content extraction is entity-specific:**

   - `PostContentExtractionStrategy` knows which Post fields to extract
   - Different strategies for different entities (Post vs Segment)

2. **Template variables are flexible:**

   - Any field from Post can be a template variable
   - Prompt template can use any variable: `{{title}}`, `{{author}}`, etc.

3. **Prompt is stored in database:**

   - `systemPrompt`: Instructions for LLM
   - `userPromptTemplate`: Template with `{{placeholders}}`
   - `jsonSchema`: Expected response structure

4. **LLM call is standardized:**
   - All LLM calls go through `LLMExtractionService`
   - Handles JSON parsing, error handling, fallbacks
   - Works with any LLM provider (Ollama, OpenAI, etc.)
