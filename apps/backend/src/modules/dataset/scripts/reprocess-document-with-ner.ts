#!/usr/bin/env ts-node-esm

/**
 * Reprocess Document with Chinese NER
 *
 * This script reprocesses a specific document to update its keywords
 * using the new Chinese NER model instead of the old n-gram method.
 *
 * Usage: npm run reprocess-document <documentId>
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../app.module';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';

async function reprocessDocument(documentId: string) {
  console.log('\n🔄 Reprocessing Document with Chinese NER');
  console.log('=========================================');
  console.log(`Document ID: ${documentId}`);

  const app = await NestFactory.createApplicationContext(AppModule);
  const eventEmitter = app.get(EventEmitter2);
  const dataSource = app.get(DataSource);

  try {
    // Get document info
    const documentRepo = dataSource.getRepository('Document');
    const document = await documentRepo.findOne({
      where: { id: documentId },
      relations: ['dataset'],
    });

    if (!document) {
      console.log(`❌ Document not found: ${documentId}`);
      process.exit(1);
    }

    console.log(`📄 Document: ${document.name}`);
    console.log(`📁 Dataset: ${document.datasetId}`);
    console.log(`📊 Current Status: ${document.indexingStatus}`);

    // Get existing segments count
    const segmentRepo = dataSource.getRepository('DocumentSegment');
    const existingSegments = await segmentRepo.count({
      where: { documentId: documentId },
    });

    console.log(`📋 Existing Segments: ${existingSegments}`);

    if (existingSegments > 0) {
      console.log(
        '\n⚠️  This will delete existing segments and recreate them with Chinese NER keywords.',
      );
      console.log(
        '💡 New keywords will be extracted using the BERT Chinese NER model.',
      );

      // In a real script, you might want to ask for confirmation
      // For now, we'll proceed automatically
      console.log('\n🚀 Starting reprocessing...');
    } else {
      console.log('\n🚀 Starting initial processing...');
    }

    // Get dataset to determine embedding configuration
    const dataset =
      document.dataset ||
      (await dataSource.getRepository('Dataset').findOne({
        where: { id: document.datasetId },
      }));

    if (!dataset) {
      console.log(`❌ Dataset not found: ${document.datasetId}`);
      process.exit(1);
    }

    // Parse existing indexStruct to get embedding configuration
    let embeddingConfig;
    try {
      const indexStruct = dataset.indexStruct
        ? JSON.parse(dataset.indexStruct)
        : {};

      embeddingConfig = {
        model: dataset.embeddingModel || 'bge-m3',
        customModelName: indexStruct.customModelName,
        provider: 'local',
        textSplitter: indexStruct.textSplitter || 'character',
        chunkSize: indexStruct.chunkSize || 1000,
        chunkOverlap: indexStruct.chunkOverlap || 200,
        separators: indexStruct.separators || ['\n\n', '\n', ' ', ''],
        enableParentChildChunking:
          indexStruct.enableParentChildChunking || false,
        useModelDefaults: indexStruct.useModelDefaults !== false, // Default to true
      };
    } catch {
      // Use default configuration if parsing fails
      embeddingConfig = {
        model: 'bge-m3',
        provider: 'local',
        textSplitter: 'character',
        chunkSize: 1000,
        chunkOverlap: 200,
        separators: ['\n\n', '\n', ' ', ''],
        enableParentChildChunking: false,
        useModelDefaults: true, // Enable model-specific optimizations by default
      };
    }

    console.log(
      `🔧 Embedding Config: ${JSON.stringify(embeddingConfig, null, 2)}`,
    );

    // Emit the document processing event
    console.log('\n📤 Emitting document processing event...');

    eventEmitter.emit('document.processing', {
      documentId: documentId,
      datasetId: document.datasetId,
      embeddingConfig: embeddingConfig,
      userId: document.userId, // Use the original document creator
    });

    console.log('✅ Document processing event emitted successfully!');
    console.log('\n📈 Progress Monitoring:');
    console.log('- Check the application logs for processing progress');
    console.log(
      '- Document status will update from "processing" to "completed"',
    );
    console.log('- New segments will be created with Chinese NER keywords');

    console.log('\n🔍 To verify the results:');
    console.log(
      `1. Check document status: SELECT indexing_status FROM documents WHERE id = '${documentId}';`,
    );
    console.log(
      `2. Check new keywords: SELECT keywords FROM document_segments WHERE document_id = '${documentId}' LIMIT 3;`,
    );
    console.log(
      '3. Look for Chinese entities like "陳茂波", "2024" instead of n-gram fragments',
    );

    // Wait a moment to let the event be processed
    await new Promise((resolve) => setTimeout(resolve, 2000));
  } catch (error) {
    console.error(`❌ Error reprocessing document: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await app.close();
  }

  console.log('\n✅ Reprocessing initiated successfully!');
  console.log(
    '📊 Monitor the logs to see the Chinese NER extraction in action.',
  );
}

// Get document ID from command line arguments
const documentId = process.argv[2];

if (!documentId) {
  console.log('\n❌ Usage: npm run reprocess-document <documentId>');
  console.log(
    'Example: npm run reprocess-document "123e4567-e89b-12d3-a456-426614174000"',
  );
  process.exit(1);
}

// Validate UUID format
const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if (!uuidRegex.test(documentId)) {
  console.log('❌ Invalid document ID format. Please provide a valid UUID.');
  process.exit(1);
}

// Check if this file is being run directly
if (
  require.main === module ||
  process.argv[1]?.endsWith('reprocess-document-with-ner.ts')
) {
  reprocessDocument(documentId).catch(console.error);
}
