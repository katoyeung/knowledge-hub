import { Injectable } from '@nestjs/common';
import { ContentExtractionStrategy } from '../interfaces/content-extraction-strategy.interface';
import { DocumentSegment } from '../../../../dataset/entities/document-segment.entity';

/**
 * Content extraction strategy for DocumentSegment entities
 * Extracts content and template variables from DocumentSegment for LLM processing
 */
@Injectable()
export class SegmentContentExtractionStrategy
  implements ContentExtractionStrategy<DocumentSegment>
{
  getEntityType(): string {
    return 'segment';
  }

  extractContent(segment: DocumentSegment): string {
    const parts: string[] = [];

    // Main content
    if (segment.content) {
      parts.push(`Content: ${segment.content}`);
    }

    // Answer if available
    if (segment.answer) {
      parts.push(`Answer: ${segment.answer}`);
    }

    // Position information
    if (segment.position !== undefined) {
      parts.push(`Position: ${segment.position}`);
    }

    // Hierarchy information for parent-child chunking
    if (segment.segmentType) {
      parts.push(`Segment Type: ${segment.segmentType}`);
    }

    if (segment.hierarchyLevel) {
      parts.push(`Hierarchy Level: ${segment.hierarchyLevel}`);
    }

    // Additional metadata if available
    if (segment.hierarchyMetadata) {
      const metaFields = Object.entries(segment.hierarchyMetadata).map(
        ([key, value]) => `${key}: ${JSON.stringify(value)}`,
      );

      if (metaFields.length > 0) {
        parts.push(`Metadata:\n${metaFields.join('\n')}`);
      }
    }

    return parts.join('\n\n');
  }

  getEntityId(segment: DocumentSegment): string {
    return segment.id;
  }

  extractTemplateVariables(segment: DocumentSegment): Record<string, string> {
    const variables: Record<string, string> = {};

    if (segment.content) {
      variables.content = segment.content;
      variables.text = segment.content;
    }

    if (segment.position !== undefined) {
      variables.position = String(segment.position);
    }

    if (segment.segmentType) {
      variables.segmentType = segment.segmentType;
    }

    if (segment.hierarchyLevel) {
      variables.hierarchyLevel = String(segment.hierarchyLevel);
    }

    if (segment.wordCount) {
      variables.wordCount = String(segment.wordCount);
    }

    if (segment.tokens) {
      variables.tokens = String(segment.tokens);
    }

    // Extract from hierarchy metadata
    if (segment.hierarchyMetadata) {
      const meta = segment.hierarchyMetadata as Record<string, any>;
      if (meta.title) {
        variables.title = String(meta.title);
      }
      if (meta.author) {
        variables.author = String(meta.author);
      }
    }

    return variables;
  }
}
