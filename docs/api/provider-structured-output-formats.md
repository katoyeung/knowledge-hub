# Provider-Specific Structured Output Formats

This document explains how different LLM providers handle structured output and how the Knowledge Hub system adapts between them.

## Overview

Different LLM providers use different attribute structures for structured output:

- **OpenAI**: Uses `response_format` with `json_schema` wrapper
- **Ollama**: Uses `format` field with direct schema
- **Anthropic**: Uses `response_format` similar to OpenAI
- **Others**: Use system message injection

## Provider Formats

### OpenAI Format

```json
{
  "messages": [
    { "role": "user", "content": "What's the weather like in London?" }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "weather",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {
          "location": {
            "type": "string",
            "description": "City or location name"
          },
          "temperature": {
            "type": "number",
            "description": "Temperature in Celsius"
          },
          "conditions": {
            "type": "string",
            "description": "Weather conditions description"
          }
        },
        "required": ["location", "temperature", "conditions"],
        "additionalProperties": false
      }
    }
  }
}
```

### Ollama Format

```json
{
  "model": "llama4:scout",
  "messages": [
    {
      "role": "user",
      "content": "Explain quicksort in C and return structured JSON with language, algorithm, code, time_complexity"
    }
  ],
  "format": {
    "type": "object",
    "properties": {
      "language": { "type": "string" },
      "algorithm": { "type": "string" },
      "code": { "type": "string" },
      "time_complexity": { "type": "string" }
    },
    "required": ["language", "algorithm", "code"]
  }
}
```

### Anthropic Format

```json
{
  "messages": [
    {
      "role": "user",
      "content": "Analyze this data and return structured results"
    }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "analysis_result",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {
          "summary": { "type": "string" },
          "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
          "recommendations": { "type": "array", "items": { "type": "string" } }
        },
        "required": ["summary", "confidence"],
        "additionalProperties": false
      }
    }
  }
}
```

## Prompt Module Integration

### Prompt Entity Schema

The `Prompt` entity supports structured output through the `jsonSchema` field:

```typescript
@Entity({ name: "prompts" })
export class Prompt extends BaseEntity {
  @Column("jsonb", { nullable: true })
  jsonSchema: object; // Can contain any provider format
}
```

### Schema Normalization

The system automatically normalizes different schema formats:

```typescript
// Input formats supported:
{
  // OpenAI format
  "name": "response",
  "strict": true,
  "schema": { /* actual schema */ }
}

// Ollama format
{
  "type": "object",
  "properties": { /* properties */ },
  "required": ["field1", "field2"]
}

// Nested format
{
  "json_schema": {
    "name": "response",
    "schema": { /* actual schema */ }
  }
}
```

## Usage Examples

### 1. Creating a Prompt with Structured Output

```javascript
const promptData = {
  name: "Algorithm Explanation",
  systemPrompt: "You are an expert computer science tutor.",
  jsonSchema: {
    // OpenAI format
    name: "algorithm_explanation",
    strict: true,
    schema: {
      type: "object",
      properties: {
        algorithm_name: { type: "string" },
        description: { type: "string" },
        time_complexity: { type: "string" },
        code_example: { type: "string" },
      },
      required: [
        "algorithm_name",
        "description",
        "time_complexity",
        "code_example",
      ],
      additionalProperties: false,
    },
  },
};
```

### 2. Using Prompt with Different Providers

```javascript
// The system automatically adapts the schema for each provider
const response = await llmClient.chatCompletionWithPrompt(
  messages,
  model,
  prompt, // Contains jsonSchema
  temperature
);
```

### 3. Direct Schema Usage

```javascript
// For direct API calls without prompts
const response = await llmClient.chatCompletion(
  messages,
  model,
  jsonSchema, // Will be adapted based on provider
  temperature
);
```

## Automatic Adaptation

The system automatically converts between formats:

### OpenAI Provider

```javascript
// Input schema
{
  type: "object",
  properties: { name: { type: "string" } },
  required: ["name"]
}

// Becomes
{
  response_format: {
    type: "json_schema",
    json_schema: {
      name: "response",
      strict: true,
      schema: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
        additionalProperties: false
      }
    }
  }
}
```

### Ollama Provider

```javascript
// Input schema
{
  type: "object",
  properties: { name: { type: "string" } },
  required: ["name"]
}

// Becomes
{
  format: {
    type: "object",
    properties: { name: { type: "string" } },
    required: ["name"],
    additionalProperties: false
  }
}
```

### Custom Providers (Perplexity, DashScope)

```javascript
// Input schema
{
  type: "object",
  properties: { name: { type: "string" } },
  required: ["name"]
}

// Becomes system message injection
{
  messages: [
    {
      role: "system",
      content: "You must respond with valid JSON that matches this schema: {\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\"}},\"required\":[\"name\"]}"
    },
    { role: "user", content: "..." }
  ]
}
```

## Schema Validation

The system provides validation for schema compatibility:

```javascript
const validation = validateSchemaCompatibility(schema, provider);
// Returns: { compatible: boolean, warnings: string[], suggestions: string[] }
```

### Common Validation Rules

1. **All Providers**: Schema should have `type: "object"`
2. **All Providers**: Should have `properties` defined
3. **OpenAI**: Works better with `additionalProperties: false`
4. **Ollama**: May not support complex schema references
5. **Custom Providers**: Should avoid complex nested structures

## Best Practices

### 1. Schema Design

- Use simple, flat object structures when possible
- Always specify `required` fields
- Use `additionalProperties: false` for stricter output
- Provide clear descriptions for each field

### 2. Provider Selection

- Use OpenAI for complex schemas with strict requirements
- Use Ollama for simple, direct schemas
- Use custom providers for basic JSON output needs

### 3. Error Handling

- Always validate JSON responses
- Handle parsing errors gracefully
- Provide fallback strategies for failed structured output

### 4. Testing

- Test with multiple providers
- Validate required fields are present
- Check for proper data types
- Monitor response consistency

## Troubleshooting

### Common Issues

1. **Invalid JSON Response**

   - Check if provider supports structured output
   - Verify schema compatibility
   - Try simpler schema structure

2. **Missing Required Fields**

   - Ensure schema requirements are clear
   - Check if provider follows schema strictly
   - Consider making fields optional

3. **Type Mismatches**

   - Verify field types in schema
   - Check provider-specific type handling
   - Use string types for complex data

4. **Provider Not Available**
   - Check provider configuration
   - Verify API keys and endpoints
   - Test with health check endpoints

### Debug Tips

1. Enable debug logging to see schema adaptation
2. Test with simple schemas first
3. Compare responses across providers
4. Use schema validation tools
5. Monitor provider-specific error messages

## Migration Guide

### From Direct Schema Usage

```javascript
// Old way
const response = await llmClient.chatCompletion(messages, model, schema);

// New way (automatic adaptation)
const response = await llmClient.chatCompletion(messages, model, schema);
// System automatically adapts schema based on provider
```

### From Manual Format Handling

```javascript
// Old way
if (provider === "openai") {
  payload.response_format = { type: "json_schema", json_schema: schema };
} else if (provider === "ollama") {
  payload.format = schema;
}

// New way (automatic)
const payload = buildRequestPayload(messages, model, schema, temperature);
// System handles all provider-specific formatting
```

This system ensures that your JSON schemas work seamlessly across all LLM providers without requiring manual format conversion.
