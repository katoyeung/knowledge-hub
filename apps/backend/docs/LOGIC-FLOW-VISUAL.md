# Complete Logic Flow - Code References

## Flow Diagram with Code Locations

````
┌─────────────────────────────────────────────────────────────────┐
│ 1. POST APPROVAL JOB ENTRY POINT                                │
│ File: post-approval.job.ts                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ async process(data: PostApprovalJobData)                       │
│ Lines: 41-87                                                    │
│                                                                 │
│ • Extracts: postId, promptId, aiProviderId, model, temperature│
│ • Defines field mappings for approval                          │
│ • Calls: genericLLMProcessingJob.process()                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. GENERIC LLM PROCESSING JOB                                  │
│ File: generic-llm-processing.job.ts                            │
│ Lines: 78-180                                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Load Entity                                            │
│ Lines: 98-104                                                   │
│                                                                 │
│ const entity = await this.loadEntity(entityType, entityId);   │
│                                                                 │
│ • Queries: SELECT * FROM posts WHERE id = ?                     │
│ • Returns: Full Post entity object                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: Get Processing Policy                                  │
│ Lines: 106-107                                                  │
│                                                                 │
│ const policy = this.processingPolicyFactory.getPolicy('post');  │
│                                                                 │
│ • Returns: PostProcessingPolicy                                │
│ • Contains: ContentExtractionStrategy + ResultApplicationStrategy│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Extract Content                                         │
│ Lines: 117-119                                                  │
│                                                                 │
│ const contentExtractionStrategy =                              │
│   policy.getContentExtractionStrategy();                        │
│ const content = contentExtractionStrategy.extractContent(entity);│
│                                                                 │
│ • Calls: PostContentExtractionStrategy.extractContent()         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. CONTENT EXTRACTION STRATEGY                                  │
│ File: post-content-extraction-strategy.ts                      │
│ Lines: 17-52                                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ extractContent(post: Post): string                             │
│                                                                 │
│ Logic:                                                          │
│ 1. if (post.title) → parts.push(`Title: ${post.title}`)        │
│ 2. if (post.meta?.content) → parts.push(`Content: ...`)        │
│ 3. if (post.source) → parts.push(`Source: ${post.source}`)    │
│ 4. if (post.provider) → parts.push(`Provider: ...`)            │
│ 5. if (post.postedAt) → parts.push(`Posted At: ...`)           │
│ 6. if (post.meta) → Extract all meta fields                    │
│                                                                 │
│ Return: parts.join('\n\n')                                      │
│                                                                 │
│ Example Output:                                                 │
│ "Title: 老豆開礦？錢，自己印？幫洗？\n\n                        │
│  Content: [content]\n\n                                         │
│  Source: test\n\n                                              │
│  Provider: test\n\n                                            │
│  Posted At: 2025-11-04T08:41:28.340Z"                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: Extract Template Variables                             │
│ Lines: 121-127                                                  │
│                                                                 │
│ const entityTemplateVariables =                                │
│   contentExtractionStrategy.extractTemplateVariables(entity);   │
│ const allTemplateVariables = {                                 │
│   ...entityTemplateVariables,                                  │
│   ...additionalTemplateVariables,                              │
│ };                                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ extractTemplateVariables(post: Post)                          │
│ Lines: 58-95                                                    │
│                                                                 │
│ Logic:                                                          │
│ 1. if (post.title) → variables.title = post.title              │
│ 2. if (post.source) → variables.source = post.source           │
│ 3. if (post.provider) → variables.provider = post.provider     │
│ 4. if (post.postedAt) → variables.postedAt = ISO string        │
│ 5. if (post.meta.content) → variables.content = ...            │
│ 6. if (post.meta.author) → variables.author = ...              │
│ 7. if (post.meta.platform) → variables.platform = ...          │
│                                                                 │
│ Return: { title, source, provider, postedAt, date,              │
│          content, author, platform, engagement }               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 5: Get Prompt and AI Provider                             │
│ Lines: 129-146                                                  │
│                                                                 │
│ const prompt = await this.promptService.findPromptById(promptId);│
│ const aiProvider = await this.aiProviderService.findOne(...);  │
│                                                                 │
│ • Queries: SELECT * FROM prompts WHERE id = ?                   │
│ • Returns: Prompt with systemPrompt, userPromptTemplate, jsonSchema│
│ • Queries: SELECT * FROM ai_providers WHERE id = ?             │
│ • Returns: AiProvider with name, baseUrl, apiKey, etc.         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 6: Create LLM Client                                      │
│ Lines: 148-149                                                  │
│                                                                 │
│ const llmClient = this.llmClientFactory.createClient(aiProvider);│
│                                                                 │
│ • Creates: OllamaClient, OpenAIClient, etc. based on provider  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 7: Call LLM Extraction Service                            │
│ Lines: 151-164                                                  │
│                                                                 │
│ const extractionResult = await this.llmExtractionService        │
│   .extractWithLLM({                                             │
│     prompt,                                                     │
│     aiProvider,                                                 │
│     model,                                                      │
│     temperature,                                                │
│     content,              ← Extracted content string            │
│     templateVariables: allTemplateVariables, ← Template vars    │
│   }, llmClient, { allowTextFallback: true });                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. LLM EXTRACTION SERVICE                                       │
│ File: llm-extraction.service.ts                                 │
│ Lines: 18-79                                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ async extractWithLLM()                                         │
│                                                                 │
│ STEP 7.1: Build User Prompt                                     │
│ Lines: 24-29                                                     │
│                                                                 │
│ const userPrompt = this.buildUserPrompt(                        │
│   config.content,        ← Extracted content                    │
│   config.prompt,         ← Prompt from database               │
│   config.templateVariables, ← Template variables                │
│ );                                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ buildUserPrompt() - Template Replacement                        │
│ Lines: 84-112                                                   │
│                                                                 │
│ Logic:                                                          │
│ 1. let userPrompt = prompt.userPromptTemplate;                  │
│                                                                 │
│ 2. Replace standard variables:                                  │
│    userPrompt.replace(/\{\{content\}\}/g, content)             │
│    userPrompt.replace(/\{\{text\}\}/g, content)               │
│    userPrompt.replace(/\{\{post\}\}/g, content)               │
│                                                                 │
│ 3. Replace custom variables:                                    │
│    for (const [key, value] of templateVariables) {             │
│      userPrompt.replace(/\{\{key\}\}/g, value)                 │
│    }                                                            │
│                                                                 │
│ Example:                                                        │
│ Template: "Analyze: {{content}}\nTitle: {{title}}"             │
│ After:   "Analyze: Title: ...\nContent: ...\nTitle: 老豆開礦..."│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 7.2: Build Messages Array                                 │
│ Lines: 31-35                                                    │
│                                                                 │
│ const messages: LLMMessage[] = [                                │
│   {                                                             │
│     role: 'system',                                             │
│     content: config.prompt.systemPrompt,  ← From database       │
│   },                                                            │
│   {                                                             │
│     role: 'user',                                               │
│     content: userPrompt,  ← Built with template replacement   │
│   },                                                            │
│ ];                                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 7.3: Call LLM Client                                      │
│ Lines: 39-45                                                    │
│                                                                 │
│ const response = await llmClient.chatCompletion(                 │
│   messages,              ← [{role: 'system', ...}, {...}]     │
│   config.model,          ← 'llama3.3:70b'                      │
│   config.prompt.jsonSchema, ← Expected JSON structure          │
│   config.temperature,    ← 0.1                                 │
│ );                                                              │
│                                                                 │
│ • LLM Client makes HTTP request:                               │
│   POST http://localhost:11434/api/chat                        │
│   {                                                            │
│     "model": "llama3.3:70b",                                   │
│     "messages": [...],                                          │
│     "format": { "type": "json_schema", "schema": {...} }       │
│   }                                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 7.4: Parse JSON Response                                   │
│ Lines: 54-65                                                    │
│                                                                 │
│ const content = response.data.choices[0].message.content;     │
│ const parsed = this.parseJSONFromResponse<T>(content, ...);     │
│                                                                 │
│ • Handles:                                                      │
│   - Markdown code blocks: ```json {...} ```                    │
│   - Direct JSON: {...}                                         │
│   - Text fallback if needed                                    │
│                                                                 │
│ Return: { success: true, data: {...}, rawContent: "..." }      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 8: Apply Result to Post                                   │
│ Lines: 166-180                                                  │
│                                                                 │
│ const llmResult = extractionResult.data;                       │
│ await policy.process(entityId, llmResult, fieldMappings, ...);  │
│                                                                 │
│ • Calls: PostResultApplicationStrategy.applyResult()            │
│ • Uses: FieldMappingService to map LLM result → Post fields     │
│ • Updates: UPDATE posts SET status=..., approval_reason=...     │
└─────────────────────────────────────────────────────────────────┘
````

## Key Code Logic Details

### 1. Content Extraction Logic

```17:52:apps/backend/src/modules/queue/jobs/llm-processing/strategies/post-content-extraction-strategy.ts
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

**What it does:**

- Checks each Post field conditionally
- Formats each field with a label
- Joins all parts with `\n\n` (double newline)
- Returns formatted string for LLM

### 2. Template Variable Extraction Logic

```58:95:apps/backend/src/modules/queue/jobs/llm-processing/strategies/post-content-extraction-strategy.ts
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

**What it does:**

- Extracts key fields as key-value pairs
- Converts dates to ISO strings
- Converts meta fields to strings
- Returns object for template replacement

### 3. Template Replacement Logic

```84:112:apps/backend/src/common/services/llm-extraction.service.ts
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

**What it does:**

- Uses regex to find `{{variable}}` patterns
- Replaces with actual values
- Global flag (`g`) replaces all occurrences
- Returns final prompt string

### 4. LLM Call Logic

```18:79:apps/backend/src/common/services/llm-extraction.service.ts
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

**What it does:**

1. Builds user prompt (template replacement)
2. Creates messages array (system + user)
3. Calls LLM client with messages, model, schema, temperature
4. Extracts content from response
5. Parses JSON from content
6. Returns structured result or error

## Data Flow Example

### Input (Post Entity)

```json
{
  "id": "e4765358-46e1-4290-a09d-aa5b4c4770a2",
  "title": "老豆開礦？錢，自己印？幫洗？",
  "meta": {
    "content": "Post content here...",
    "author": "user123"
  },
  "source": "test",
  "provider": "test"
}
```

### Step 1: Content Extraction

```
"Title: 老豆開礦？錢，自己印？幫洗？

Content: Post content here...

Source: test

Provider: test"
```

### Step 2: Template Variables

```json
{
  "title": "老豆開礦？錢，自己印？幫洗？",
  "source": "test",
  "provider": "test",
  "content": "Post content here...",
  "author": "user123"
}
```

### Step 3: Prompt Template

```
"Analyze the following social media post:

{{content}}

Title: {{title}}
Source: {{source}}"
```

### Step 4: After Template Replacement

```
"Analyze the following social media post:

Title: 老豆開礦？錢，自己印？幫洗？

Content: Post content here...

Source: test
Provider: test

Title: 老豆開礦？錢，自己印？幫洗？
Source: test"
```

### Step 5: LLM Messages

```json
[
  {
    "role": "system",
    "content": "You are an expert content moderator..."
  },
  {
    "role": "user",
    "content": "Analyze the following social media post:\n\n..."
  }
]
```

### Step 6: LLM Response

```json
{
  "status": "approved",
  "reason": "Content is appropriate",
  "confidenceScore": 0.95
}
```

### Step 7: Database Update

```sql
UPDATE posts
SET status = 'approved',
    approval_reason = 'Content is appropriate',
    confidence_score = 0.95
WHERE id = 'e4765358-46e1-4290-a09d-aa5b4c4770a2'
```
