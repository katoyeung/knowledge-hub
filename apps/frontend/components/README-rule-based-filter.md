# Rule-Based Content Filtering Component

A comprehensive React component for configuring content filtering rules using JSON objects and regex patterns. This component is designed for use in workflow systems and document processing pipelines.

## Features

- **JSON Object Input**: Configure filtering rules using structured JSON objects
- **Visual Rule Editor**: Intuitive form-based interface for creating and editing rules
- **JSON Editor**: Direct JSON editing with validation
- **Example Templates**: Pre-built rule templates for common use cases
- **Real-time Validation**: Immediate feedback on configuration errors
- **Rule Management**: Add, edit, duplicate, and delete rules
- **Regex Support**: Full regex pattern matching with flags
- **Multiple Actions**: Remove, keep, or flag matching content
- **Length Constraints**: Filter by content length
- **Case Sensitivity**: Configurable case-sensitive matching

## Components

### 1. RuleBasedFilterConfig

The main configuration component for rule-based content filtering.

```tsx
import { RuleBasedFilterConfig } from "@/components/rule-based-filter-config";

<RuleBasedFilterConfig
  config={filterConfig}
  onChange={handleConfigChange}
  onValidate={handleValidation}
/>;
```

### 2. WorkflowNodeRuleFilter

A wrapper component designed for integration with workflow node configurations.

```tsx
import { WorkflowNodeRuleFilter } from "@/components/workflow-node-rule-filter";

<WorkflowNodeRuleFilter
  config={nodeConfig}
  onChange={handleConfigChange}
  onValidate={handleValidation}
/>;
```

## Configuration Structure

### FilterRule Interface

```typescript
interface FilterRule {
  id: string; // Unique identifier
  name: string; // Display name
  pattern: string; // Regex pattern
  flags?: string; // Regex flags (i, g, m, etc.)
  action: "remove" | "keep" | "flag"; // Action to take
  description?: string; // Optional description
  enabled: boolean; // Whether rule is active
}
```

### RuleBasedFilterConfig Interface

```typescript
interface RuleBasedFilterConfig {
  rules: FilterRule[]; // Array of filtering rules
  defaultAction: "keep" | "remove"; // Default action when no rules match
  caseSensitive?: boolean; // Global case sensitivity
  wholeWord?: boolean; // Whole word matching
  minContentLength?: number; // Minimum content length
  maxContentLength?: number; // Maximum content length
  preserveEmptySegments?: boolean; // Whether to keep empty segments
}
```

## Usage Examples

### Basic Usage

```tsx
import { useState } from "react";
import { RuleBasedFilterConfig } from "@/components/rule-based-filter-config";

function MyComponent() {
  const [config, setConfig] = useState({
    rules: [],
    defaultAction: "keep",
    caseSensitive: false,
    wholeWord: false,
    minContentLength: 20,
    maxContentLength: 5000,
    preserveEmptySegments: false,
  });

  const handleConfigChange = (newConfig) => {
    setConfig(newConfig);
  };

  const handleValidate = (isValid, errors) => {
    console.log("Validation:", { isValid, errors });
  };

  return (
    <RuleBasedFilterConfig
      config={config}
      onChange={handleConfigChange}
      onValidate={handleValidate}
    />
  );
}
```

### With Pre-configured Rules

```tsx
const initialConfig = {
  rules: [
    {
      id: "remove-short-content",
      name: "Remove Short Content",
      pattern: "^.{0,10}$",
      flags: "",
      action: "remove",
      description: "Remove segments with 10 characters or less",
      enabled: true,
    },
    {
      id: "keep-important-keywords",
      name: "Keep Important Keywords",
      pattern: "(important|urgent|critical)",
      flags: "i",
      action: "keep",
      description: "Keep segments containing important keywords",
      enabled: true,
    },
  ],
  defaultAction: "keep",
  caseSensitive: false,
  minContentLength: 20,
  maxContentLength: 5000,
};
```

### JSON Configuration

```json
{
  "rules": [
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
      "id": "flag-spam-content",
      "name": "Flag Spam Content",
      "pattern": "(spam|scam|phishing)",
      "flags": "i",
      "action": "flag",
      "description": "Flag segments containing spam-related terms",
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

## Rule Examples

### Content Length Rules

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

### HTML/Markup Rules

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

### Keyword-Based Rules

```json
{
  "id": "keep-important-keywords",
  "name": "Keep Important Keywords",
  "pattern": "(important|urgent|critical|priority)",
  "flags": "i",
  "action": "keep",
  "description": "Keep segments containing important keywords"
}
```

### Quality Control Rules

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

## Integration with Workflow Systems

### Workflow Node Configuration

```tsx
// In your workflow node configuration component
import { WorkflowNodeRuleFilter } from "@/components/workflow-node-rule-filter";

function WorkflowNodeConfig({ node, onSave }) {
  const handleConfigChange = (newConfig) => {
    onSave({
      ...node,
      config: newConfig,
    });
  };

  return (
    <WorkflowNodeRuleFilter
      config={node.config}
      onChange={handleConfigChange}
      onValidate={(isValid, errors) => {
        // Handle validation results
      }}
    />
  );
}
```

### Backend Integration

The component generates configuration that can be directly used with the backend `RuleBasedFilterStep`:

```typescript
// Backend step configuration
const stepConfig = {
  stepType: "rule_based_filter",
  config: {
    rules: [
      {
        id: "remove-short-content",
        name: "Remove Short Content",
        pattern: "^.{0,10}$",
        flags: "",
        action: "remove",
        description: "Remove segments with 10 characters or less",
        enabled: true,
      },
    ],
    defaultAction: "keep",
    caseSensitive: false,
    wholeWord: false,
    minContentLength: 20,
    maxContentLength: 5000,
    preserveEmptySegments: false,
  },
};
```

## Validation

The component provides comprehensive validation:

- **Required Fields**: All required fields must be present
- **Regex Validation**: Pattern syntax is validated
- **Action Validation**: Actions must be valid values
- **Length Constraints**: Min/max length validation
- **JSON Validation**: JSON syntax validation in editor mode

## Styling

The component uses Tailwind CSS classes and follows the design system:

- **Cards**: For grouping related content
- **Tabs**: For organizing different views
- **Alerts**: For validation messages
- **Badges**: For status indicators
- **Buttons**: For actions and navigation

## Dependencies

- React 18+
- Tailwind CSS
- Lucide React (for icons)
- Custom UI components (Button, Input, Label, etc.)

## File Structure

```
components/
├── rule-based-filter-config.tsx      # Main configuration component
├── rule-based-filter-examples.md     # Examples and documentation
├── workflow-node-rule-filter.tsx     # Workflow integration wrapper
└── README-rule-based-filter.md       # This documentation
```

## Demo

A complete demo is available at `/rule-based-filter-demo` showing:

- Configuration interface
- Real-time validation
- Test results with sample data
- Rule performance metrics

## Best Practices

1. **Start Simple**: Begin with basic rules and add complexity gradually
2. **Test Thoroughly**: Always test rules with sample data
3. **Use Descriptive Names**: Make rule names and descriptions clear
4. **Order Matters**: Place more specific rules before general ones
5. **Validate Patterns**: Test regex patterns before using
6. **Monitor Performance**: Complex patterns can slow processing
7. **Document Rules**: Add clear descriptions for maintenance

## Troubleshooting

### Common Issues

1. **Invalid Regex**: Check pattern syntax and escape special characters
2. **Performance**: Avoid overly complex patterns
3. **Unexpected Results**: Test patterns with sample data
4. **Case Sensitivity**: Use the 'i' flag for case-insensitive matching
5. **Global Matching**: Use the 'g' flag to find all matches

### Debug Tips

- Use the JSON Editor to see exact configuration
- Check validation errors in the UI
- Test individual rules by disabling others
- Use the demo page to test with sample data
