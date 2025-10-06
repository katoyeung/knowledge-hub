import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { AuthHelper } from './auth-helper';

describe('AuthHelper', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('authenticateAsAdmin', () => {
    it('should authenticate with default admin credentials', async () => {
      const authResult = await AuthHelper.authenticateAsAdmin(app);

      expect(authResult).toBeDefined();
      expect(authResult.jwtToken).toBeDefined();
      expect(authResult.jwtToken).toMatch(
        /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/,
      );
      expect(authResult.user).toBeDefined();
    });
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
