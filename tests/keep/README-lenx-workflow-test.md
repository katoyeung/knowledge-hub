# Lenx API Workflow - Fixed Date Mode Test

This test script verifies that a workflow with Lenx API Data Source in fixed date mode is working correctly.

## What It Tests

1. **Chunking Verification**: Verifies that the date range is correctly divided into chunks based on the `dateIntervalMinutes` configuration
2. **Date Coverage Verification**: Verifies that all posts within the specified time period are retrieved

## Prerequisites

- Backend server running on `http://localhost:3001`
- Valid JWT authentication token
- Workflow ID configured in the script

## Usage

### Option 1: Set JWT_TOKEN as environment variable

```bash
JWT_TOKEN=your_jwt_token_here node tests/keep/test-lenx-workflow-fixed-date.js
```

### Option 2: Edit the script

1. Open `tests/keep/test-lenx-workflow-fixed-date.js`
2. Update the `JWT_TOKEN` constant on line 16:
   ```javascript
   const JWT_TOKEN = "your_jwt_token_here";
   ```
3. Update the `WORKFLOW_ID` constant if testing a different workflow:
   ```javascript
   const WORKFLOW_ID = "6cdcf5f3-ca42-43ca-9f3f-ae6837cc594a";
   ```
4. Run the script:
   ```bash
   node tests/keep/test-lenx-workflow-fixed-date.js
   ```

## How to Get JWT Token

1. Log in to the frontend application
2. Open browser DevTools (F12)
3. Go to Application/Storage → Local Storage
4. Copy the value of `authToken`

Or use the login API:

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"yourpassword"}' | jq -r '.access_token'
```

## Test Workflow Configuration

The workflow must have:

- A node of type `lenx_api_datasource`
- `dateMode` set to `"fixed"`
- `startDate` and `endDate` configured (ISO 8601 format)
- `dateIntervalMinutes` configured (e.g., 60 for 1-hour chunks)

## Test Output

The test will output:

1. **Workflow Configuration**: Shows the workflow and Lenx node configuration
2. **Execution Status**: Monitors workflow execution until completion
3. **Chunking Verification**:
   - Calculates expected number of chunks
   - Compares with actual chunks processed
4. **Date Coverage Verification**:
   - Extracts post dates from the response
   - Verifies all posts are within the date range
   - Reports coverage percentage

## Expected Results

- ✓ Chunking Verification: PASSED
- ✓ Date Coverage Verification: PASSED (≥95% of posts in range)

## Troubleshooting

### "JWT_TOKEN not set"

- Set the JWT_TOKEN environment variable or edit the script

### "Lenx API Data Source node not found"

- Verify the workflow has a node with `type: 'lenx_api_datasource'`

### "Execution timeout"

- The workflow might be taking longer than expected (default: 5 minutes)
- Increase `maxWaitTime` in the `waitForExecution` function

### "No posts found"

- The date range might not contain any posts
- Check the Lenx API response manually
- Verify the query parameters are correct

### "Date coverage insufficient"

- Some posts might be slightly outside the range due to API behavior
- Check the "Out of range dates" list in the output
- Verify the API's date filtering logic
