# AuthHelper - Shared Authentication Utility for E2E Tests

## Overview

The `AuthHelper` class provides a centralized way to handle authentication in e2e tests, eliminating the need to duplicate authentication logic across test files.

## Features

- ✅ **Consistent Credentials**: Uses the correct admin credentials from seed data
- ✅ **Error Handling**: Provides clear error messages when authentication fails
- ✅ **Flexible Authentication**: Support for both admin and custom user authentication
- ✅ **Helper Methods**: Convenient methods for making authenticated requests
- ✅ **Type Safety**: Full TypeScript support with proper interfaces

## Usage Examples

### Basic Authentication

```typescript
import { AuthHelper } from './auth-helper';

describe('My E2E Tests', () => {
  let app: INestApplication;
  let jwtToken: string;

  beforeAll(async () => {
    // ... setup app ...

    // Authenticate as admin
    const authResult = await AuthHelper.authenticateAsAdmin(app);
    jwtToken = authResult.jwtToken;
  });

  it('should make authenticated request', async () => {
    const response = await request(app.getHttpServer())
      .get('/protected-endpoint')
      .set(AuthHelper.getAuthHeader(jwtToken))
      .expect(200);
  });
});
```

### Using Helper Methods

```typescript
describe('API Tests', () => {
  let app: INestApplication;
  let jwtToken: string;

  beforeAll(async () => {
    const authResult = await AuthHelper.authenticateAsAdmin(app);
    jwtToken = authResult.jwtToken;
  });

  it('should create dataset', async () => {
    const response = await AuthHelper.makeAuthenticatedRequest(
      app,
      jwtToken,
      'post',
      '/datasets',
      {
        name: 'Test Dataset',
        description: 'Test Description',
      },
    );

    expect(response.status).toBe(201);
  });
});
```

### Custom User Authentication

```typescript
describe('User-specific Tests', () => {
  let app: INestApplication;
  let userToken: string;

  beforeAll(async () => {
    // Create and authenticate custom user
    const authResult = await AuthHelper.createAndAuthenticateUser(app, {
      email: 'test@example.com',
      password: 'testpassword123',
      name: 'Test User',
    });
    userToken = authResult.jwtToken;
  });
});
```

## Available Methods

### `authenticateAsAdmin(app: INestApplication)`

Authenticates with the default admin user credentials.

**Returns:** `Promise<AuthResult>`

### `authenticate(app: INestApplication, user: TestUser)`

Authenticates with custom user credentials.

**Parameters:**

- `app`: NestJS application instance
- `user`: User credentials object

**Returns:** `Promise<AuthResult>`

### `createAndAuthenticateUser(app: INestApplication, user: TestUser)`

Creates a new user and authenticates with their credentials.

**Parameters:**

- `app`: NestJS application instance
- `user`: User credentials object

**Returns:** `Promise<AuthResult>`

### `getAuthHeader(jwtToken: string)`

Returns the authorization header object for authenticated requests.

**Parameters:**

- `jwtToken`: JWT token string

**Returns:** `{ Authorization: string }`

### `makeAuthenticatedRequest(app, jwtToken, method, url, data?)`

Creates a pre-configured authenticated request.

**Parameters:**

- `app`: NestJS application instance
- `jwtToken`: JWT token string
- `method`: HTTP method ('get', 'post', 'put', 'delete', 'patch')
- `url`: Request URL
- `data`: Optional request body data

**Returns:** SuperTest request object

### `waitForAuthReady(app: INestApplication, maxRetries?)`

Waits for authentication to be ready (useful for test setup).

**Parameters:**

- `app`: NestJS application instance
- `maxRetries`: Maximum number of retry attempts (default: 10)

**Returns:** `Promise<void>`

## Interfaces

### `TestUser`

```typescript
interface TestUser {
  email: string;
  password: string;
  name?: string;
}
```

### `AuthResult`

```typescript
interface AuthResult {
  jwtToken: string;
  user: any;
}
```

## Migration from Manual Authentication

### Before (Manual)

```typescript
// ❌ Old way - duplicated across every test file
const loginResponse = await request(app.getHttpServer())
  .post('/auth/login')
  .send({
    email: 'admin@example.com',
    password: 'admin123', // Wrong password!
  });

jwtToken = loginResponse.body.access_token;
```

### After (Using AuthHelper)

```typescript
// ✅ New way - centralized and consistent
const authResult = await AuthHelper.authenticateAsAdmin(app);
jwtToken = authResult.jwtToken;
```

## Benefits

1. **Consistency**: All tests use the same authentication logic
2. **Maintainability**: Changes to auth logic only need to be made in one place
3. **Error Handling**: Better error messages when authentication fails
4. **Type Safety**: Full TypeScript support prevents runtime errors
5. **Reusability**: Easy to use across different test files
6. **Correct Credentials**: Uses the actual admin credentials from seed data

## Troubleshooting

### Authentication Fails

If authentication fails, check:

1. Database is seeded with admin user
2. AuthModule is properly imported in AppModule
3. JWT strategy is correctly configured

### Import Errors

Make sure to use the correct import path:

```typescript
import { AuthHelper } from './auth-helper'; // For test files in /test directory
import { AuthHelper } from '../../../test/auth-helper'; // For test files in modules
```
