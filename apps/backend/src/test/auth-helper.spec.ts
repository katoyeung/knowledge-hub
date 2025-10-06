import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../app.module';
import { AuthHelper } from '../../test/auth-helper';

describe.skip('AuthHelper', () => {
  let app: INestApplication;
  let moduleFixture: TestingModule;

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
      // Small delay to ensure cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (moduleFixture) {
      await moduleFixture.close();
    }
  }, 10000);

  describe('authenticateAsAdmin', () => {
    it('should authenticate with default admin credentials', async () => {
      const authResult = await AuthHelper.authenticateAsAdmin(app);

      expect(authResult).toBeDefined();
      expect(authResult.jwtToken).toBeDefined();
      expect(authResult.jwtToken).toMatch(
        /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/,
      );
      expect(authResult.user).toBeDefined();
    }, 15000);
  });

  describe('getAuthHeader', () => {
    it('should return proper authorization header', () => {
      const token = 'test-jwt-token';
      const header = AuthHelper.getAuthHeader(token);

      expect(header).toEqual({
        Authorization: 'Bearer test-jwt-token',
      });
    });
  });

  describe('makeAuthenticatedRequest', () => {
    it('should create authenticated request with proper headers', async () => {
      const token = 'test-jwt-token';
      const request = AuthHelper.makeAuthenticatedRequest(
        app,
        token,
        'get',
        '/test-endpoint',
      );

      expect(request).toBeDefined();
    });
  });
});
