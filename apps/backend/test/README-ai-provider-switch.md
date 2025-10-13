# AI Provider Switch E2E Tests

This test suite verifies that AI provider switching works correctly with different chat settings configurations. It tests the cascading fallback logic for chat settings resolution.

## Test Scenarios

The test covers three main scenarios:

### 1. Empty Dataset and User Settings

- **Configuration**: No chat settings configured anywhere
- **Expected Behavior**: Should use system defaults
- **Default Provider**: `openrouter`
- **Default Model**: `openai/gpt-4`
- **Default Temperature**: `0.7`
- **Default Max Chunks**: `5`

### 2. Empty Dataset but User Settings Exist

- **Configuration**: Only user chat settings configured
- **Expected Behavior**: Should use user settings
- **User Settings**: DashScope provider with custom model and parameters
- **Validation**: Verifies user settings take precedence over system defaults

### 3. Both Dataset and User Settings Exist

- **Configuration**: Both dataset and user chat settings configured
- **Expected Behavior**: Dataset settings should take precedence
- **Dataset Settings**: OpenRouter provider with specific model
- **User Settings**: DashScope provider (should be ignored)
- **Validation**: Verifies dataset settings override user settings

## Test Structure

### Test Providers

The test creates three different AI providers for testing:

- **OpenRouter**: `google/gemma-3-27b-it:free`
- **DashScope**: `qwen3-max`
- **Ollama (Custom)**: `llama3.1:8b`

### Configuration Resolution

The test validates the following configuration resolution logic:

1. **Dataset Chat Settings** (highest priority)
2. **User Chat Settings** (fallback)
3. **System Defaults** (final fallback)

### Validation Points

- Provider type selection
- Model selection
- Temperature setting
- Max chunks setting
- Response time performance

## Running the Tests

### Prerequisites

1. Backend server must be running on `localhost:3001`
2. Database must be accessible
3. AI providers must be properly configured

### Quick Run

```bash
# From the backend directory
./test/run-ai-provider-switch-tests.sh
```

### Manual Run

```bash
# From the backend directory
npm run test:e2e -- --testPathPattern=ai-provider-switch.e2e-spec.ts --verbose
```

## Test Output

The test provides detailed output including:

- Configuration comparison (expected vs actual)
- Response time measurements
- Success/failure status for each scenario
- Summary statistics
- Debug information from chat service logs

## Expected Results

All three scenarios should pass, demonstrating:

1. ✅ System defaults work when no settings are configured
2. ✅ User settings are properly applied when dataset settings are empty
3. ✅ Dataset settings take precedence over user settings when both exist

## Troubleshooting

### Common Issues

1. **Backend not running**: Ensure the backend server is started
2. **Database connection**: Check database connectivity
3. **AI provider configuration**: Verify AI providers are properly set up
4. **Authentication**: Ensure test user has proper permissions

### Debug Information

The test reads debug logs from `/tmp/debug-chat.log` to extract detailed configuration information used during chat processing.

## Integration with Existing Tests

This test complements the existing `simple-chat-e2e.e2e-spec.ts` by focusing specifically on AI provider switching and configuration resolution, while the simple chat test focuses on end-to-end chat functionality with document processing.
