#!/usr/bin/env npx ts-node

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../app.module';
import { DocumentSegmentService } from '../document-segment.service';
import { ChineseTextPreprocessorService } from '../../document-parser/services/chinese-text-preprocessor.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DocumentSegment } from '../entities/document-segment.entity';

/**
 * Migration script to fix existing Chinese document segments
 * by applying Chinese text preprocessing to remove empty lines
 */
async function fixChineseSegments() {
  console.log('🚀 Starting Chinese Segments Fix Migration');
  console.log('='.repeat(60));

  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const segmentService = app.get(DocumentSegmentService);
    const chinesePreprocessor = app.get(ChineseTextPreprocessorService);

    // Get all document segments
    console.log('📊 Fetching all document segments...');
    const allSegments = await segmentService.find();
    console.log(`Found ${allSegments.length} total segments`);

    let chineseSegments = 0;
    let fixedSegments = 0;
    let skippedSegments = 0;

    for (const segment of allSegments) {
      const originalContent = segment.content;

      // Check if this is Chinese text that needs fixing
      if (chinesePreprocessor.isChineseText(originalContent)) {
        chineseSegments++;

        // Check if it has empty line issues
        const hasEmptyLines =
          /\n\s*\n/.test(originalContent) || /^\s*$/gm.test(originalContent);
        const hasExcessiveSpaces = /\s{3,}/.test(originalContent);

        if (hasEmptyLines || hasExcessiveSpaces) {
          console.log(
            `🔧 Fixing segment ${segment.id} (position ${segment.position})`,
          );

          // Apply Chinese preprocessing
          const processedContent =
            chinesePreprocessor.preprocessChineseText(originalContent);

          // Update the segment using repository
          const segmentRepository = app.get(
            getRepositoryToken(DocumentSegment),
          );
          await segmentRepository.update(segment.id, {
            content: processedContent,
            wordCount: processedContent.split(' ').length,
            tokens: Math.ceil(processedContent.length / 4),
          });

          fixedSegments++;

          console.log(
            `  ✅ Fixed: ${originalContent.length} → ${processedContent.length} chars`,
          );
        } else {
          skippedSegments++;
        }
      }
    }

    console.log('\n📈 MIGRATION RESULTS');
    console.log('-'.repeat(40));
    console.log(`Total segments: ${allSegments.length}`);
    console.log(`Chinese segments: ${chineseSegments}`);
    console.log(`Fixed segments: ${fixedSegments}`);
    console.log(`Skipped (already clean): ${skippedSegments}`);
    console.log(
      `Non-Chinese segments: ${allSegments.length - chineseSegments}`,
    );

    console.log('\n✅ Migration completed successfully!');
    console.log(
      'Your Chinese document segments should now be free of empty lines.',
    );
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await app.close();
  }
}

// Run the migration
if (require.main === module) {
  fixChineseSegments()
    .then(() => {
      console.log('🎉 Chinese segments fix completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    });
}

export { fixChineseSegments };
