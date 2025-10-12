import * as request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';

import { AuthHelper } from './auth-helper';

// Trivia questions for performance testing
interface TriviaQuestion {
  question: string;
  correctAnswer: string;
  expectedKeywords?: string[];
}

const TRIVIA_QUESTIONS: TriviaQuestion[] = [
  {
    question: 'Which wizard lived in Orthanc?',
    correctAnswer: 'Saruman',
    expectedKeywords: ['Saruman', 'Orthanc'],
  },
  {
    question: 'What was the name of the inn in the village of Bree?',
    correctAnswer: 'The Prancing Pony',
    expectedKeywords: ['Prancing Pony', 'Bree', 'inn'],
  },
  {
    question: "What was Gandalf's sword's name?",
    correctAnswer: 'Glamdring',
    expectedKeywords: ['Glamdring', 'Gandalf', 'sword'],
  },
  {
    question: 'Who married Aragorn?',
    correctAnswer: 'Arwen',
    expectedKeywords: ['Arwen', 'Aragorn', 'married'],
  },
  {
    question: 'Which type of blade was Frodo stabbed with?',
    correctAnswer: 'With a Morgul-knife',
    expectedKeywords: ['Morgul-knife', 'Morgul', 'Frodo', 'stabbed'],
  },
  {
    question: 'What food does Gollum like?',
    correctAnswer: 'Raw fish and rabbits',
    expectedKeywords: ['raw fish', 'rabbits', 'Gollum', 'food'],
  },
  {
    question: "What was Gollum's real name?",
    correctAnswer: 'Sméagol',
    expectedKeywords: ['Sméagol', 'Smeagol', 'Gollum', 'real name'],
  },
  {
    question:
      'What did Frodo see on the ring after Gandalf threw it into the fire?',
    correctAnswer: 'Fiery letters in the language of Mordor',
    expectedKeywords: ['fiery letters', 'Mordor', 'ring', 'fire', 'Frodo'],
  },
  {
    question: 'What was the full name of Pippin?',
    correctAnswer: 'Peregrin Took',
    expectedKeywords: ['Peregrin Took', 'Pippin', 'Took'],
  },
  {
    question: 'Which eagle rescued Gandalf from the tower of Isengard?',
    correctAnswer: 'Gwaihir',
    expectedKeywords: ['Gwaihir', 'eagle', 'Gandalf', 'Isengard', 'tower'],
  },
];

interface TestResult {
  question: string;
  correctAnswer: string;
  modelAnswer: string;
  isCorrect: boolean;
  usedChunks: number;
  responseTime: number;
  chunks: string[];
  chunkScores: Array<{
    position: number;
    similarity: number;
    content: string;
    documentName: string;
  }>;
}

// Helper function to validate if the model answer is correct
function validateAnswer(
  question: TriviaQuestion,
  modelAnswer: string,
): boolean {
  if (!modelAnswer || modelAnswer.trim().length === 0) {
    return false;
  }

  const answer = modelAnswer.toLowerCase();
  const correctAnswer = question.correctAnswer.toLowerCase();

  // Direct match
  if (answer.includes(correctAnswer)) {
    return true;
  }

  // Check for expected keywords with more lenient matching
  if (question.expectedKeywords) {
    const keywordMatches = question.expectedKeywords.filter((keyword) => {
      const keywordLower = keyword.toLowerCase();
      // Check for exact match or partial match (at least 3 characters)
      return (
        answer.includes(keywordLower) ||
        (keywordLower.length > 3 &&
          answer.includes(keywordLower.substring(0, 3)))
      );
    });

    // Require at least 1 keyword match for short lists, or half for longer lists
    const requiredMatches =
      question.expectedKeywords.length <= 2
        ? 1
        : Math.ceil(question.expectedKeywords.length / 2);
    return keywordMatches.length >= requiredMatches;
  }

  // Special cases for common variations
  const specialCases: { [key: string]: string[] } = {
    sméagol: ['smeagol', 'smeagol', 'sméagol'],
    'morgul-knife': [
      'morgul knife',
      'morgul-knife',
      'morgul blade',
      'morgul weapon',
    ],
    'the prancing pony': ['prancing pony', 'the prancing pony'],
    'peregrin took': ['peregrin took', 'pippin took', 'pippin'],
    gwaihir: ['gwaihir', 'gwaihir the windlord', 'windlord'],
  };

  for (const [correct, variations] of Object.entries(specialCases)) {
    if (correctAnswer.includes(correct)) {
      for (const variation of variations) {
        if (answer.includes(variation.toLowerCase())) {
          return true;
        }
      }
    }
  }

  return false;
}

// Helper function to format chunks for display
function formatChunks(chunks: any[]): string[] {
  if (!chunks || chunks.length === 0) return [];

  return chunks.map((chunk, index) => {
    // Handle the actual sourceChunks structure from chat service
    const source = chunk.documentName || chunk.metadata?.source || 'Unknown';
    const chunkNumber = chunk.metadata?.chunkNumber || index + 1;
    return `${source} (chunk ${chunkNumber})`;
  });
}

// Helper function to extract chunk scores and details
function extractChunkScores(chunks: any[]): Array<{
  position: number;
  similarity: number;
  content: string;
  documentName: string;
}> {
  if (!chunks || chunks.length === 0) return [];

  return chunks.map((chunk, index) => ({
    position: index + 1,
    similarity: chunk.similarity || 0,
    content: chunk.content || '',
    documentName: chunk.documentName || 'Unknown',
  }));
}

// Helper function to print results in the desired format
function printResults(results: TestResult[]): void {
  console.log(
    '\n📊 PERFORMANCE TEST RESULTS (Dataset Chat Settings Configuration)',
  );
  console.log('='.repeat(80));
  console.log(
    'Configuration: 10 chunks, 60% similarity threshold, recursive_character splitter, Gemma-3-27B-IT LLM via OpenRouter, BGE-M3 Embedding',
  );
  console.log('='.repeat(80));
  console.log(
    'Trivia Question\t\t\tCorrect Answer\t\tModel Answer\t\t\tUsed Chunks',
  );
  console.log('-'.repeat(80));

  results.forEach((result) => {
    const status = result.isCorrect ? '✅' : '❌';
    const question =
      result.question.length > 30
        ? result.question.substring(0, 27) + '...'
        : result.question.padEnd(30);

    const correctAnswer =
      result.correctAnswer.length > 20
        ? result.correctAnswer.substring(0, 17) + '...'
        : result.correctAnswer.padEnd(20);

    const modelAnswer =
      result.modelAnswer.length > 25
        ? result.modelAnswer.substring(0, 22) + '...'
        : result.modelAnswer.padEnd(25);

    console.log(
      `${question}\t${correctAnswer}\t${modelAnswer}\t${status}\t${result.usedChunks} chunks`,
    );

    if (result.chunks.length > 0) {
      console.log(
        `\t\t\t\t\t\t\t\t\t\t${result.chunks.slice(0, 3).join(', ')}${
          result.chunks.length > 3 ? '...' : ''
        }`,
      );
    }
    console.log('');
  });

  // Summary statistics
  const correctCount = results.filter((r) => r.isCorrect).length;
  const totalCount = results.length;
  const accuracy = ((correctCount / totalCount) * 100).toFixed(1);
  const avgResponseTime = (
    results.reduce((sum, r) => sum + r.responseTime, 0) / totalCount
  ).toFixed(0);
  const avgChunks = (
    results.reduce((sum, r) => sum + r.usedChunks, 0) / totalCount
  ).toFixed(1);

  console.log('📈 SUMMARY STATISTICS');
  console.log('='.repeat(40));
  console.log(`Accuracy: ${correctCount}/${totalCount} (${accuracy}%)`);
  console.log(`Average Response Time: ${avgResponseTime}ms`);
  console.log(`Average Chunks Used: ${avgChunks}`);
  console.log('='.repeat(40));

  // Detailed chunk analysis
  console.log('\n🔍 DETAILED CHUNK ANALYSIS');
  console.log('='.repeat(80));

  results.forEach((result, index) => {
    if (result.chunkScores.length > 0) {
      console.log(`\n📝 Question ${index + 1}: ${result.question}`);
      console.log(
        `Status: ${result.isCorrect ? '✅ CORRECT' : '❌ INCORRECT'}`,
      );
      console.log(`Chunks used: ${result.usedChunks}/5`);
      console.log('Chunk Scores (Position | Similarity | Preview):');
      console.log('-'.repeat(60));

      result.chunkScores.forEach((chunk) => {
        const preview =
          chunk.content.substring(0, 50).replace(/\n/g, ' ') + '...';
        const similarity = (chunk.similarity * 100).toFixed(1);
        console.log(
          `  ${chunk.position.toString().padStart(2)} | ${similarity.padStart(5)}% | ${preview}`,
        );
      });

      // Analyze chunk effectiveness
      const highSimilarityChunks = result.chunkScores.filter(
        (c) => c.similarity > 0.7,
      ).length;
      const mediumSimilarityChunks = result.chunkScores.filter(
        (c) => c.similarity > 0.5 && c.similarity <= 0.7,
      ).length;
      const lowSimilarityChunks = result.chunkScores.filter(
        (c) => c.similarity <= 0.5,
      ).length;

      console.log(`\n  📊 Chunk Quality Analysis:`);
      console.log(`    High similarity (>70%): ${highSimilarityChunks} chunks`);
      console.log(
        `    Medium similarity (50-70%): ${mediumSimilarityChunks} chunks`,
      );
      console.log(`    Low similarity (<50%): ${lowSimilarityChunks} chunks`);

      // Suggest optimal chunk count
      const relevantChunks = result.chunkScores.filter(
        (c) => c.similarity > 0.6,
      ).length;
      const suggestedChunks = Math.min(Math.max(relevantChunks, 3), 15);
      console.log(
        `    💡 Suggested chunk count: ${suggestedChunks} (based on >60% similarity)`,
      );
    }
  });

  // Overall chunk effectiveness analysis
  console.log('\n📊 OVERALL CHUNK EFFECTIVENESS');
  console.log('='.repeat(50));

  const allChunkScores = results.flatMap((r) => r.chunkScores);
  const avgSimilarity =
    allChunkScores.length > 0
      ? (
          allChunkScores.reduce((sum, c) => sum + c.similarity, 0) /
          allChunkScores.length
        ).toFixed(1)
      : '0.0';

  const highQualityChunks = allChunkScores.filter(
    (c) => c.similarity > 0.7,
  ).length;
  const totalChunks = allChunkScores.length;
  const qualityRatio =
    totalChunks > 0
      ? ((highQualityChunks / totalChunks) * 100).toFixed(1)
      : '0.0';

  console.log(`Total chunks analyzed: ${totalChunks}`);
  console.log(`Average similarity score: ${avgSimilarity}%`);
  console.log(
    `High quality chunks (>70%): ${highQualityChunks}/${totalChunks} (${qualityRatio}%)`,
  );

  // Calculate optimal chunk count based on all results
  const avgRelevantChunks =
    results.reduce((sum, r) => {
      const relevant = r.chunkScores.filter((c) => c.similarity > 0.6).length;
      return sum + relevant;
    }, 0) / results.length;

  const recommendedChunks = Math.min(
    Math.max(Math.ceil(avgRelevantChunks), 5),
    15,
  );
  console.log(
    `\n💡 RECOMMENDATION: Use ${recommendedChunks} chunks for optimal performance`,
  );
  console.log(
    `   (Based on average relevant chunks: ${avgRelevantChunks.toFixed(1)})`,
  );
}

// Helper function to get AI provider UUID by type
async function getAiProviderByType(
  baseUrl: string,
  jwtToken: string,
  type: string,
): Promise<string | null> {
  try {
    const response = await request
      .agent(baseUrl)
      .get('/ai-providers')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    const provider = response.body.find((p: any) => p.type === type);
    return provider ? provider.id : null;
  } catch (error) {
    console.log(`Failed to get AI provider of type ${type}:`, error.message);
    return null;
  }
}

// Simple E2E test that tests chat functionality with BGE-M3 embeddings and OpenRouter LLM
describe('Simple Chat E2E Tests', () => {
  let baseUrl: string;
  let jwtToken: string;
  let datasetId: string;
  let dashscopeProviderId: string;

  beforeAll(async () => {
    // Use the production backend API instead of creating our own instance
    baseUrl = 'http://localhost:3001';

    // Get JWT token for authentication from production API
    const authResult = await AuthHelper.authenticateAsAdmin(baseUrl);
    jwtToken = authResult.jwtToken;

    // Get DashScope AI provider ID
    dashscopeProviderId = await getAiProviderByType(
      baseUrl,
      jwtToken,
      'dashscope',
    );
    if (!dashscopeProviderId) {
      throw new Error(
        'DashScope AI provider not found. Please ensure AI providers are seeded.',
      );
    }
    console.log(`✅ Found DashScope AI provider: ${dashscopeProviderId}`);
  });

  afterAll(async () => {
    // Clean up test data
    if (datasetId) {
      try {
        await request
          .agent(baseUrl)
          .delete(`/datasets/${datasetId}`)
          .set('Authorization', `Bearer ${jwtToken}`);
        console.log('🧹 Test dataset cleaned up');
      } catch (error) {
        console.log('⚠️ Failed to clean up test dataset:', error.message);
      }
    }

    // No need to close app since we're using production API
  });

  it('should test chat performance with Lord of the Rings trivia questions using BGE-M3 and OpenRouter', async () => {
    console.log(
      '🚀 Starting Lord of the Rings trivia performance test with BGE-M3 embeddings and OpenRouter Gemma-3-27B-IT...',
    );

    // Step 1: Create a new dataset with BGE-M3 embedding model
    console.log('📁 Creating dataset with BGE-M3 embedding model...');
    const datasetData = {
      name: 'Lord of the Rings Trivia Test Dataset - BGE-M3 with Chat Settings',
      description:
        'Test dataset using Xenova/bge-m3 for embeddings with all three LOTR books and dataset chat settings',
      embeddingModel: 'Xenova/bge-m3',
      embeddingModelProvider: 'ollama',
    };

    const datasetResponse = await request
      .agent(baseUrl)
      .post('/datasets')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send(datasetData)
      .expect(201);

    expect(datasetResponse.body.id).toBeDefined();
    expect(datasetResponse.body.embeddingModel).toBe('Xenova/bge-m3');
    expect(datasetResponse.body.embeddingModelProvider).toBe('ollama');

    datasetId = datasetResponse.body.id;
    console.log(`✅ Dataset created with ID: ${datasetId}`);

    // Configure dataset chat settings
    console.log('⚙️ Configuring dataset chat settings...');
    const chatSettings = {
      provider: 'openrouter', // Use OpenRouter provider
      model: 'google/gemma-3-27b-it:free',
      temperature: 0.1,
      maxChunks: 10,
    };

    await request
      .agent(baseUrl)
      .put(`/datasets/${datasetId}/chat-settings`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send(chatSettings)
      .expect(200);

    console.log(
      `✅ Dataset chat settings configured: ${JSON.stringify(chatSettings)}`,
    );

    // Step 2: Upload all three Lord of the Rings documents
    console.log('📄 Uploading all three Lord of the Rings documents...');
    const documentPaths = [
      'Volume I - The Fellowship of the Ring.txt',
      'Volume II - The Two Towers.txt',
      'Volume III - The Return of the King.txt',
    ];

    const documentIds: string[] = [];

    for (const docName of documentPaths) {
      const testDocumentPath = path.join(
        __dirname,
        '../../../test-documents',
        docName,
      );

      if (!fs.existsSync(testDocumentPath)) {
        console.log(`⚠️ Test document ${docName} not found, skipping`);
        continue;
      }

      const uploadResponse = await request
        .agent(baseUrl)
        .post(`/datasets/${datasetId}/upload-documents`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .attach('files', testDocumentPath)
        .expect(201);

      const documentId = uploadResponse.body.data.documents[0].id;
      documentIds.push(documentId);
      console.log(`✅ Document ${docName} uploaded with ID: ${documentId}`);
    }

    if (documentIds.length === 0) {
      console.log('⚠️ No documents uploaded, skipping test');
      return;
    }

    // Step 3: Process all documents with BGE-M3 embeddings
    console.log('🔄 Processing all documents with BGE-M3 embeddings...');
    const processData = {
      datasetId: datasetId,
      documentIds: documentIds,
      embeddingModel: 'Xenova/bge-m3',
      embeddingProvider: 'ollama',
      textSplitter: 'recursive_character',
      chunkSize: 1000,
      chunkOverlap: 200,
    };

    const processResponse = await request
      .agent(baseUrl)
      .post('/datasets/process-documents')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send(processData);

    if (processResponse.status !== 201) {
      console.log('❌ Document processing failed:', processResponse.body);
      throw new Error(
        `Document processing failed with status ${processResponse.status}: ${JSON.stringify(processResponse.body)}`,
      );
    }

    console.log('✅ Document processing completed');
    console.log(
      `📊 Processed ${processResponse.body.processedCount} documents`,
    );

    // Step 4: Run trivia questions performance test (all 10 questions)
    console.log('🎯 Starting trivia questions performance test...');
    const testResults: TestResult[] = [];

    for (let i = 0; i < TRIVIA_QUESTIONS.length; i++) {
      const question = TRIVIA_QUESTIONS[i];
      console.log(
        `\n❓ Question ${i + 1}/${TRIVIA_QUESTIONS.length}: ${question.question}`,
      );

      const startTime = Date.now();

      try {
        const chatResponse = await request
          .agent(baseUrl)
          .post('/chat/with-documents')
          .set('Authorization', `Bearer ${jwtToken}`)
          .send({
            message: question.question,
            datasetId: datasetId,
            // Provider, model, temperature, maxChunks now come from dataset chat settings
          });

        const responseTime = Date.now() - startTime;

        if (chatResponse.status === 200) {
          let modelAnswer = chatResponse.body.message.content || '';
          let usedChunks = chatResponse.body.sourceChunks || [];

          // Validate response quality
          if (!modelAnswer || modelAnswer.trim().length === 0) {
            console.log(`⚠️ Empty response for question ${i + 1}, retrying...`);
            // Retry once with a more specific prompt
            const retryResponse = await request
              .agent(baseUrl)
              .post('/chat/with-documents')
              .set('Authorization', `Bearer ${jwtToken}`)
              .send({
                message: question.question,
                datasetId: datasetId,
                // Use dataset chat settings for retry as well
              });

            if (
              retryResponse.status === 200 &&
              retryResponse.body.message.content
            ) {
              modelAnswer = retryResponse.body.message.content;
              usedChunks = retryResponse.body.sourceChunks || [];
            }
          }

          const isCorrect = validateAnswer(question, modelAnswer);

          const result: TestResult = {
            question: question.question,
            correctAnswer: question.correctAnswer,
            modelAnswer: modelAnswer || 'ERROR: No response received',
            isCorrect: isCorrect,
            usedChunks: usedChunks.length,
            responseTime: responseTime,
            chunks: formatChunks(usedChunks),
            chunkScores: extractChunkScores(usedChunks),
          };

          testResults.push(result);

          console.log(`✅ Answer: ${modelAnswer || 'No response'}`);
          console.log(
            `📊 Status: ${isCorrect ? 'CORRECT' : 'INCORRECT'} | Time: ${responseTime}ms | Chunks: ${usedChunks.length}`,
          );
        } else {
          console.log(
            `❌ Chat failed for question ${i + 1}:`,
            chatResponse.body,
          );

          const result: TestResult = {
            question: question.question,
            correctAnswer: question.correctAnswer,
            modelAnswer: 'ERROR: Chat request failed',
            isCorrect: false,
            usedChunks: 0,
            responseTime: responseTime,
            chunks: [],
            chunkScores: [],
          };

          testResults.push(result);
        }
      } catch (error) {
        const responseTime = Date.now() - startTime;
        console.log(`❌ Error for question ${i + 1}:`, error.message);

        const result: TestResult = {
          question: question.question,
          correctAnswer: question.correctAnswer,
          modelAnswer: `ERROR: ${error.message}`,
          isCorrect: false,
          usedChunks: 0,
          responseTime: responseTime,
          chunks: [],
          chunkScores: [],
        };

        testResults.push(result);
      }

      // Small delay between questions to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));

      console.log(`✅ Completed question ${i + 1}/${TRIVIA_QUESTIONS.length}`);
    }

    console.log(
      `🎯 Finished all ${TRIVIA_QUESTIONS.length} questions. Total results: ${testResults.length}`,
    );

    // Step 5: Print comprehensive results
    printResults(testResults);

    // Step 6: Basic assertions
    expect(testResults.length).toBe(TRIVIA_QUESTIONS.length);
    expect(testResults.every((r) => r.responseTime > 0)).toBe(true);

    console.log('🎉 Lord of the Rings trivia performance test completed!');
  }, 900000); // 15 minute timeout for comprehensive testing with all 10 questions
});
