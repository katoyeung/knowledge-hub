import { INestApplication } from '@nestjs/common';
import request from 'supertest';

export interface TestUser {
  email: string;
  password: string;
  name?: string;
}

export interface AuthResult {
  jwtToken: string;
  user: any;
}

/**
 * Shared authentication utility for e2e tests
 */
export class AuthHelper {
  private static readonly DEFAULT_ADMIN_USER: TestUser = {
    email: 'admin@example.com',
    password: 'PassW0rd@2025', // This matches the seed data
    name: 'Super Admin',
  };

  /**
   * Authenticate with the default admin user
   */
  static async authenticateAsAdmin(
    appOrUrl: INestApplication | string,
  ): Promise<AuthResult> {
    return this.authenticate(appOrUrl, this.DEFAULT_ADMIN_USER);
  }

  /**
   * Authenticate with custom user credentials
   */
  static async authenticate(
    appOrUrl: INestApplication | string,
    user: TestUser,
  ): Promise<AuthResult> {
    const baseUrl =
      typeof appOrUrl === 'string' ? appOrUrl : appOrUrl.getHttpServer();

    const loginResponse = await request(baseUrl)
      .post('/auth/login')
      .send({
        email: user.email,
        password: user.password,
      })
      .expect(201);

    if (!loginResponse.body.access_token) {
      throw new Error(
        `Authentication failed for user ${user.email}. Response: ${JSON.stringify(
          loginResponse.body,
        )}`,
      );
    }

    return {
      jwtToken: loginResponse.body.access_token,
      user: loginResponse.body.user || { email: user.email, name: user.name },
    };
  }

  /**
   * Create a test user and return authentication result
   */
  static async createAndAuthenticateUser(
    app: INestApplication,
    user: TestUser,
  ): Promise<AuthResult> {
    // First, create the user
    const createUserResponse = await request(app.getHttpServer())
      .post('/users')
      .send({
        name: user.name || 'Test User',
        email: user.email,
        password: user.password,
      })
      .expect(201);

    // Then authenticate
    return this.authenticate(app, user);
  }

  /**
   * Get authorization header for authenticated requests
   */
  static getAuthHeader(jwtToken: string): { Authorization: string } {
    return {
      Authorization: `Bearer ${jwtToken}`,
    };
  }

  /**
   * Make an authenticated request helper
   */
  static async makeAuthenticatedRequest(
    app: INestApplication,
    jwtToken: string,
    method: 'get' | 'post' | 'put' | 'delete' | 'patch',
    url: string,
    data?: any,
  ) {
    const req = request(app.getHttpServer())
      [method](url)
      .set(this.getAuthHeader(jwtToken));

    if (data) {
      return req.send(data);
    }

    return req;
  }

  /**
   * Wait for authentication to be ready (useful for test setup)
   */
  static async waitForAuthReady(
    app: INestApplication,
    maxRetries = 10,
  ): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await this.authenticateAsAdmin(app);
        return;
      } catch (error) {
        if (i === maxRetries - 1) {
          throw new Error(
            `Authentication not ready after ${maxRetries} retries. Last error: ${error.message}`,
          );
        }
        // Wait 1 second before retry
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }
}
