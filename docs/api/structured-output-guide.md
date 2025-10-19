# Structured Output Support Guide

This guide explains how to use structured output with different LLM providers in the Knowledge Hub system.

## Overview

Structured output allows you to request that LLM responses follow a specific JSON schema, ensuring consistent and parseable responses. Different providers support this feature in different ways:

- **OpenAI**: Native JSON schema support via `response_format`
- **Ollama**: Format field with JSON schema
- **Perplexity/DashScope**: System message injection for JSON structure

## Supported Providers

| Provider   | Native Support | Format Type       | Notes                                       |
| ---------- | -------------- | ----------------- | ------------------------------------------- |
| OpenAI     | ✅             | `response_format` | Uses OpenAI's native JSON schema format     |
| Ollama     | ✅             | `format`          | Uses Ollama's format field with JSON schema |
| Perplexity | ⚠️             | System message    | Injects JSON schema into system message     |
| DashScope  | ⚠️             | System message    | Injects JSON schema into system message     |

## Usage

### API Request Format

```json
{
  "messages": [
    {
      "role": "user",
      "content": "Explain quicksort in C and return structured JSON with language, algorithm, code, time_complexity"
    }
  ],
  "model": "gpt-4",
  "jsonSchema": {
    "type": "object",
    "properties": {
      "language": { "type": "string" },
      "algorithm": { "type": "string" },
      "code": { "type": "string" },
      "time_complexity": { "type": "string" }
    },
    "required": ["language", "algorithm", "code"]
  },
  "temperature": 0.7
}
```

### Example cURL Request

```bash
curl --location 'http://localhost:3001/api/ai-providers/{provider-id}/chat-completion' \
--header 'Content-Type: application/json' \
--data '{
    "messages": [
        {"role": "user", "content": "Explain quicksort in C and return structured JSON with language, algorithm, code, time_complexity"}
    ],
    "model": "gpt-4",
    "jsonSchema": {
        "type": "object",
        "properties": {
            "language": {"type": "string"},
            "algorithm": {"type": "string"},
            "code": {"type": "string"},
            "time_complexity": {"type": "string"}
        },
        "required": ["language", "algorithm", "code"]
    },
    "temperature": 0.7
}'
```

## Provider-Specific Implementation

### OpenAI

OpenAI uses the native `response_format` field:

```json
{
  "response_format": {
    "type": "json_schema",
    "json_schema": {
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
}
```

### Ollama

Ollama uses the `format` field:

```json
{
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

### Perplexity & DashScope

These providers use system message injection:

```json
{
  "messages": [
    {
      "role": "system",
      "content": "You must respond with valid JSON that matches this schema: {\"type\":\"object\",\"properties\":{\"language\":{\"type\":\"string\"},\"algorithm\":{\"type\":\"string\"},\"code\":{\"type\":\"string\"},\"time_complexity\":{\"type\":\"string\"}},\"required\":[\"language\",\"algorithm\",\"code\"]}"
    },
    {
      "role": "user",
      "content": "Explain quicksort in C and return structured JSON with language, algorithm, code, time_complexity"
    }
  ]
}
```

## Testing

Use the provided test script to verify structured output works with all providers:

```bash
node test-structured-output.js
```

This script will:

1. Test each available provider
2. Send a structured output request
3. Verify the response is valid JSON
4. Check that required fields are present

## Best Practices

1. **Always specify required fields** in your JSON schema
2. **Use descriptive field names** that clearly indicate the expected content
3. **Test with multiple providers** to ensure compatibility
4. **Handle parsing errors gracefully** in your application code
5. **Consider fallback strategies** for providers that don't support native structured output

## Error Handling

If structured output fails, the system will:

1. Fall back to system message injection for unsupported providers
2. Return the raw response if JSON parsing fails
3. Log appropriate error messages for debugging

## Configuration

The structured output behavior is controlled by the `LLMProviderConfig` interface:

```typescript
interface LLMProviderConfig {
  supportsJsonSchema: boolean; // Native JSON schema support
  supportsStructuredOutput: boolean; // Structured output support (any method)
  structuredOutputFormat?: "openai" | "ollama" | "custom";
}
```

## Troubleshooting

### Common Issues

1. **Invalid JSON Response**: Some providers may not follow the schema exactly
2. **Missing Required Fields**: Check that your schema requirements are clear
3. **Provider Not Available**: Ensure the provider is properly configured and accessible
4. **Timeout Issues**: Large structured responses may take longer to generate

### Debug Tips

1. Check provider availability before sending requests
2. Use lower temperature values for more consistent structured output
3. Test with simpler schemas first
4. Monitor logs for provider-specific error messages
