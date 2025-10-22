const { DataSource } = require('typeorm');
const { Document } = require('./dist/modules/dataset/entities/document.entity');
const {
  DocumentSegment,
} = require('./dist/modules/dataset/entities/document-segment.entity');
const { Dataset } = require('./dist/modules/dataset/entities/dataset.entity');

async function triggerEmbeddingJob() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_DATABASE || 'knowledge_hub',
    entities: [Document, DocumentSegment, Dataset],
    synchronize: false,
  });

  await dataSource.initialize();
  console.log('Connected to database');

  const documentId = 'ef40e307-1379-4a02-834d-28705ed7d66b';
  const datasetId = 'e5e2a6ef-5e53-4d06-98bc-463d6735261f';

  // Get the document
  const document = await dataSource.getRepository(Document).findOne({
    where: { id: documentId },
    relations: ['dataset'],
  });

  if (!document) {
    console.log('Document not found');
    return;
  }

  console.log(`Found document: ${document.name}`);
  console.log(`Dataset: ${document.dataset.name}`);
  console.log(`Embedding model: ${document.embeddingModel}`);

  // Get waiting segments
  const waitingSegments = await dataSource.getRepository(DocumentSegment).find({
    where: {
      documentId: documentId,
      status: 'waiting',
    },
  });

  console.log(`Found ${waitingSegments.length} waiting segments`);

  if (waitingSegments.length === 0) {
    console.log('No waiting segments found');
    return;
  }

  // Create embedding job data
  const embeddingJobData = {
    documentId: documentId,
    datasetId: datasetId,
    userId: document.userId,
    embeddingConfig: {
      model: document.embeddingModel || 'Xenova/bge-m3',
      provider: 'local',
      textSplitter: 'recursive',
      chunkSize: 1000,
      chunkOverlap: 200,
      useModelDefaults: true,
    },
    nerEnabled: false,
    segmentIds: waitingSegments.map((s) => s.id),
  };

  console.log('Embedding job data:', JSON.stringify(embeddingJobData, null, 2));

  // Make API call to trigger the job
  const response = await fetch('http://localhost:3001/api/queue/dispatch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jobType: 'embedding',
      data: embeddingJobData,
    }),
  });

  const result = await response.json();
  console.log('Job dispatch result:', result);

  await dataSource.destroy();
  console.log('Done!');
}

triggerEmbeddingJob().catch(console.error);
