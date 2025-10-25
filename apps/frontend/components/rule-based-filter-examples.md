# Rule-Based Content Filtering - Examples and Documentation

## Overview

The Rule-Based Content Filtering component allows you to configure filtering rules using JSON objects to filter document segments based on regex patterns. This guide provides comprehensive examples and explains how to construct rule objects.

## Rule Object Structure

Each filtering rule is a JSON object with the following structure:

```json
{
  "id": "unique-rule-identifier",
  "name": "Human-readable rule name",
  "pattern": "regex-pattern",
  "flags": "regex-flags",
  "action": "remove|keep|flag",
  "description": "Optional description of what this rule does",
  "enabled": true
}
```

### Field Descriptions

- **id**: Unique identifier for the rule (auto-generated from name if not provided)
- **name**: Display name for the rule
- **pattern**: Regular expression pattern to match against content
- **flags**: Optional regex flags (e.g., 'i' for case-insensitive, 'g' for global)
- **action**: What to do when pattern matches:
  - `remove`: Filter out (exclude) matching segments
  - `keep`: Keep (include) matching segments
  - `flag`: Mark segments for special handling
- **description**: Optional description explaining the rule's purpose
- **enabled**: Whether the rule is active (boolean)

## Complete Configuration Example

```json
{
  "rules": [
    {
      "id": "remove-short-content",
      "name": "Remove Short Content",
      "pattern": "^.{0,10}$",
      "flags": "",
      "action": "remove",
      "description": "Remove segments with 10 characters or less",
      "enabled": true
    },
    {
      "id": "remove-html-tags",
      "name": "Remove HTML Tags",
      "pattern": "<[^>]*>",
      "flags": "g",
      "action": "remove",
      "description": "Remove segments containing HTML tags",
      "enabled": true
    },
    {
      "id": "keep-important-keywords",
      "name": "Keep Important Keywords",
      "pattern": "(important|urgent|critical|priority)",
      "flags": "i",
      "action": "keep",
      "description": "Keep segments containing important keywords",
      "enabled": true
    },
    {
      "id": "flag-spam-patterns",
      "name": "Flag Spam Patterns",
      "pattern": "(spam|scam|phishing|malware)",
      "flags": "i",
      "action": "flag",
      "description": "Flag segments containing spam-related terms",
      "enabled": true
    },
    {
      "id": "remove-numeric-only",
      "name": "Remove Numeric Only",
      "pattern": "^[0-9\\s\\.,-]+$",
      "flags": "",
      "action": "remove",
      "description": "Remove segments containing only numbers and basic punctuation",
      "enabled": true
    }
  ],
  "defaultAction": "keep",
  "caseSensitive": false,
  "wholeWord": false,
  "minContentLength": 20,
  "maxContentLength": 5000,
  "preserveEmptySegments": false
}
```

## Common Rule Patterns

### 1. Content Length Rules

```json
{
  "id": "remove-very-short",
  "name": "Remove Very Short Content",
  "pattern": "^.{0,5}$",
  "flags": "",
  "action": "remove",
  "description": "Remove segments with 5 characters or less"
}
```

```json
{
  "id": "remove-very-long",
  "name": "Remove Very Long Content",
  "pattern": "^.{10000,}$",
  "flags": "",
  "action": "remove",
  "description": "Remove segments with 10,000+ characters"
}
```

### 2. HTML and Markup Rules

```json
{
  "id": "remove-html-tags",
  "name": "Remove HTML Tags",
  "pattern": "<[^>]*>",
  "flags": "g",
  "action": "remove",
  "description": "Remove segments containing HTML tags"
}
```

```json
{
  "id": "remove-markdown-links",
  "name": "Remove Markdown Links",
  "pattern": "\\[([^\\]]+)\\]\\([^)]+\\)",
  "flags": "g",
  "action": "remove",
  "description": "Remove segments containing markdown links"
}
```

### 3. Text Quality Rules

```json
{
  "id": "remove-numeric-only",
  "name": "Remove Numeric Only",
  "pattern": "^[0-9\\s\\.,-]+$",
  "flags": "",
  "action": "remove",
  "description": "Remove segments containing only numbers and basic punctuation"
}
```

```json
{
  "id": "remove-repeated-characters",
  "name": "Remove Repeated Characters",
  "pattern": "(.)\\1{4,}",
  "flags": "",
  "action": "remove",
  "description": "Remove segments with 5+ repeated characters"
}
```

### 4. Language and Content Rules

```json
{
  "id": "keep-english-content",
  "name": "Keep English Content",
  "pattern": "^[a-zA-Z\\s\\.,!?;:'\"()-]+$",
  "flags": "",
  "action": "keep",
  "description": "Keep segments containing only English characters"
}
```

```json
{
  "id": "remove-non-printable",
  "name": "Remove Non-Printable Characters",
  "pattern": "[\\x00-\\x1F\\x7F-\\x9F]",
  "flags": "g",
  "action": "remove",
  "description": "Remove segments containing non-printable characters"
}
```

### 5. Keyword-Based Rules

```json
{
  "id": "keep-important-keywords",
  "name": "Keep Important Keywords",
  "pattern": "(important|urgent|critical|priority|alert|warning)",
  "flags": "i",
  "action": "keep",
  "description": "Keep segments containing important keywords"
}
```

```json
{
  "id": "remove-spam-keywords",
  "name": "Remove Spam Keywords",
  "pattern": "(spam|scam|phishing|malware|virus|hack)",
  "flags": "i",
  "action": "remove",
  "description": "Remove segments containing spam-related terms"
}
```

### 6. Format-Specific Rules

```json
{
  "id": "remove-email-addresses",
  "name": "Remove Email Addresses",
  "pattern": "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b",
  "flags": "g",
  "action": "remove",
  "description": "Remove segments containing email addresses"
}
```

```json
{
  "id": "remove-urls",
  "name": "Remove URLs",
  "pattern": "https?://[^\\s]+",
  "flags": "g",
  "action": "remove",
  "description": "Remove segments containing URLs"
}
```

```json
{
  "id": "remove-phone-numbers",
  "name": "Remove Phone Numbers",
  "pattern": "\\b\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b",
  "flags": "g",
  "action": "remove",
  "description": "Remove segments containing phone numbers"
}
```

### 7. Specialized Content Rules

```json
{
  "id": "keep-sentences",
  "name": "Keep Complete Sentences",
  "pattern": "^[A-Z][^.!?]*[.!?]$",
  "flags": "",
  "action": "keep",
  "description": "Keep segments that are complete sentences"
}
```

```json
{
  "id": "remove-fragments",
  "name": "Remove Sentence Fragments",
  "pattern": "^[a-z]",
  "flags": "",
  "action": "remove",
  "description": "Remove segments starting with lowercase (likely fragments)"
}
```

## Regex Flags Reference

- **i**: Case-insensitive matching
- **g**: Global matching (find all matches, not just first)
- **m**: Multiline mode (^ and $ match line boundaries)
- **s**: Dotall mode (. matches newline characters)
- **u**: Unicode mode (treat pattern as Unicode)
- **x**: Extended mode (ignore whitespace and allow comments)

## Configuration Settings

### Global Settings

```json
{
  "defaultAction": "keep",
  "caseSensitive": false,
  "wholeWord": false,
  "minContentLength": 20,
  "maxContentLength": 5000,
  "preserveEmptySegments": false
}
```

- **defaultAction**: What to do when no rules match (`keep` or `remove`)
- **caseSensitive**: Whether pattern matching is case-sensitive
- **wholeWord**: Whether to match whole words only
- **minContentLength**: Minimum content length to keep (characters)
- **maxContentLength**: Maximum content length to keep (characters)
- **preserveEmptySegments**: Whether to keep empty segments

## Advanced Examples

### Multi-Language Content Filter

```json
{
  "rules": [
    {
      "id": "keep-english",
      "name": "Keep English Content",
      "pattern": "^[a-zA-Z\\s\\.,!?;:'\"()-]+$",
      "flags": "",
      "action": "keep",
      "description": "Keep English-only content"
    },
    {
      "id": "keep-chinese",
      "name": "Keep Chinese Content",
      "pattern": "^[\\u4e00-\\u9fff\\s\\.,!?;:'\"()-]+$",
      "flags": "",
      "action": "keep",
      "description": "Keep Chinese-only content"
    },
    {
      "id": "remove-mixed",
      "name": "Remove Mixed Language",
      "pattern": "[a-zA-Z].*[\\u4e00-\\u9fff]|[\\u4e00-\\u9fff].*[a-zA-Z]",
      "flags": "",
      "action": "remove",
      "description": "Remove mixed language content"
    }
  ],
  "defaultAction": "remove"
}
```

### Quality Control Filter

```json
{
  "rules": [
    {
      "id": "remove-gibberish",
      "name": "Remove Gibberish",
      "pattern": "^[^a-zA-Z\\s]{10,}$",
      "flags": "",
      "action": "remove",
      "description": "Remove segments with mostly non-alphabetic characters"
    },
    {
      "id": "remove-repeated-words",
      "name": "Remove Repeated Words",
      "pattern": "\\b(\\w+)\\s+\\1\\s+\\1",
      "flags": "i",
      "action": "remove",
      "description": "Remove segments with 3+ repeated words"
    },
    {
      "id": "keep-meaningful",
      "name": "Keep Meaningful Content",
      "pattern": "\\b(?:the|and|or|but|in|on|at|to|for|of|with|by)\\b",
      "flags": "i",
      "action": "keep",
      "description": "Keep segments containing common English words"
    }
  ],
  "defaultAction": "remove",
  "minContentLength": 50,
  "maxContentLength": 2000
}
```

## Testing Your Rules

1. Use the JSON Editor tab to input your configuration
2. Click "Apply JSON" to validate and apply changes
3. Use the Test Step button to see how rules perform on sample data
4. Check the output to verify filtering behavior

## Best Practices

1. **Start Simple**: Begin with basic rules and gradually add complexity
2. **Test Thoroughly**: Always test rules with sample data before production
3. **Use Descriptive Names**: Make rule names and descriptions clear
4. **Order Matters**: Rules are applied in order, so place more specific rules first
5. **Validate Patterns**: Test regex patterns at regex101.com before using
6. **Monitor Performance**: Complex patterns can slow down processing
7. **Document Rules**: Add clear descriptions for future maintenance

## Troubleshooting

### Common Issues

1. **Invalid Regex**: Check pattern syntax and escape special characters
2. **Performance**: Avoid overly complex patterns or use more specific rules
3. **Unexpected Results**: Test patterns with sample data to verify behavior
4. **Case Sensitivity**: Use the 'i' flag for case-insensitive matching
5. **Global Matching**: Use the 'g' flag to find all matches, not just the first

### Debug Tips

- Use the JSON Editor to see the exact configuration being applied
- Check validation errors in the UI
- Test individual rules by temporarily disabling others
- Use the Test Step feature to see real results
