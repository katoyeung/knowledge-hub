import * as request from 'supertest';
import { AuthHelper } from './auth-helper';

describe('Debug User Settings E2E Tests', () => {
  let baseUrl: string;
  let jwtToken: string;
  let userId: string;

  beforeAll(async () => {
    baseUrl = 'http://localhost:3001';
    const authResult = await AuthHelper.authenticateAsAdmin(baseUrl);
    jwtToken = authResult.jwtToken;
    userId = authResult.user.id;
  });

  it('should debug user settings resolution', async () => {
    console.log('🔍 Debugging user settings resolution...');

    // 1. Set user chat settings
    const userChatSettings = {
      provider: '1614d1d0-e54b-42dc-82d7-8a11ac473401', // Provider ID from your curl
      model: 'z-ai/glm-4.5-air:free',
      temperature: 0.2,
      maxChunks: 8,
    };

    console.log(
      '📝 Setting user chat settings:',
      JSON.stringify(userChatSettings),
    );

    await request
      .agent(baseUrl)
      .patch(`/users/${userId}/settings`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ chat_settings: userChatSettings })
      .expect(200);

    // 2. Verify user settings were set
    const userSettingsResponse = await request
      .agent(baseUrl)
      .get(`/users/${userId}/settings`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    console.log(
      '📋 User settings after update:',
      JSON.stringify(userSettingsResponse.body),
    );

    // 3. Check if the provider exists
    const providerResponse = await request
      .agent(baseUrl)
      .get(`/ai-providers/${userChatSettings.provider}`)
      .set('Authorization', `Bearer ${jwtToken}`);

    console.log(
      '🔍 Provider lookup result:',
      providerResponse.status,
      JSON.stringify(providerResponse.body),
    );

    // 4. Test chat with documents to see what gets resolved
    const chatResponse = await request
      .agent(baseUrl)
      .post('/chat/with-documents')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        message: 'Test message to debug configuration',
        datasetId: '24bf8501-1ddd-4fe0-9e02-7b1082a72add',
      });

    console.log('💬 Chat response status:', chatResponse.status);
    if (chatResponse.status === 200) {
      console.log(
        '📊 Chat metadata:',
        JSON.stringify(chatResponse.body.metadata),
      );
    } else {
      console.log('❌ Chat error:', JSON.stringify(chatResponse.body));
    }
  });
});
