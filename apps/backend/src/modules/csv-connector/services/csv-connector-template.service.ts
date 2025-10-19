import { Injectable, Logger } from '@nestjs/common';
import {
  CsvConnectorTemplate,
  CsvConfig,
} from '../interfaces/csv-connector.interface';
import { CsvConnectorType } from '../dto/csv-upload-config.dto';

@Injectable()
export class CsvConnectorTemplateService {
  private readonly logger = new Logger(CsvConnectorTemplateService.name);

  private readonly templates: Record<string, CsvConnectorTemplate> = {
    social_media_post: {
      name: 'social_media_post',
      displayName: 'Social Media Post',
      description:
        'For social media posts with author, content, reactions, and sentiment data',
      standardFields: {
        id: 'ID',
        author: 'Author Name',
        content: 'Post Message',
        title: 'Thread Title',
        platform: 'Medium',
        site: 'Site',
        channel: 'Channel',
        sentiment: 'Sentiment',
        reactions: 'Reaction Count',
        likes: 'Like (reaction)',
        dislikes: 'Dislike (reaction)',
        angry: 'Angry (reaction)',
        haha: 'Haha (reaction)',
        love: 'Love (reaction)',
        sad: 'Sad (reaction)',
        wow: 'Wow (reaction)',
        impact: 'Impact',
        postDate: 'Post Date',
        postTime: 'Post Time',
        threadLink: 'Thread Link',
        commentCount: 'Comment Count',
        shareCount: 'Share Count',
        viewCount: 'View Count',
      },
      searchableColumns: ['Thread Title', 'Post Message'],
      metadataColumns: [
        'Author Name',
        'Medium',
        'Site',
        'Channel',
        'Post Date',
        'Post Time',
        'Thread Link',
        'Comment Count',
        'Share Count',
        'View Count',
        'Reaction Count',
        'Like (reaction)',
        'Dislike (reaction)',
        'Angry (reaction)',
        'Haha (reaction)',
        'Love (reaction)',
        'Sad (reaction)',
        'Wow (reaction)',
        'Sentiment',
        'Impact',
      ],
    },
    news_article: {
      name: 'news_article',
      displayName: 'News Article',
      description:
        'For news articles with title, content, site, and impact data',
      standardFields: {
        id: 'ID',
        title: 'Thread Title',
        content: 'Post Message',
        site: 'Site',
        author: 'Author Name',
        impact: 'Impact',
        postDate: 'Post Date',
        postTime: 'Post Time',
        threadLink: 'Thread Link',
      },
      searchableColumns: ['Thread Title', 'Post Message'],
      metadataColumns: [
        'Site',
        'Author Name',
        'Post Date',
        'Post Time',
        'Thread Link',
        'Impact',
      ],
    },
  };

  /**
   * Get all available connector templates
   */
  getAvailableTemplates(): CsvConnectorTemplate[] {
    return Object.values(this.templates);
  }

  /**
   * Get a specific template by name
   */
  getTemplate(templateName: string): CsvConnectorTemplate | null {
    return this.templates[templateName] || null;
  }

  /**
   * Create CSV configuration from template and CSV headers
   */
  createConfigFromTemplate(
    templateName: string,
    csvHeaders: string[],
  ): CsvConfig | null {
    const template = this.getTemplate(templateName);
    if (!template) {
      this.logger.warn(`Template not found: ${templateName}`);
      return null;
    }

    // Map CSV headers to standard fields
    const fieldMappings: Record<string, string> = {};
    const searchableColumns: string[] = [];
    const metadataColumns: string[] = [];

    // Find matching columns for each standard field
    for (const [standardField, templateColumn] of Object.entries(
      template.standardFields,
    )) {
      const matchingHeader = csvHeaders.find(
        (header) =>
          header.toLowerCase().trim() === templateColumn.toLowerCase().trim(),
      );

      if (matchingHeader) {
        fieldMappings[matchingHeader] = standardField;
      }
    }

    // Map searchable columns
    for (const searchableColumn of template.searchableColumns) {
      const matchingHeader = csvHeaders.find(
        (header) =>
          header.toLowerCase().trim() === searchableColumn.toLowerCase().trim(),
      );

      if (matchingHeader) {
        searchableColumns.push(matchingHeader);
      }
    }

    // Map metadata columns
    for (const metadataColumn of template.metadataColumns) {
      const matchingHeader = csvHeaders.find(
        (header) =>
          header.toLowerCase().trim() === metadataColumn.toLowerCase().trim(),
      );

      if (matchingHeader) {
        metadataColumns.push(matchingHeader);
      }
    }

    return {
      connectorType: templateName as any,
      fieldMappings,
      searchableColumns,
      totalRows: 0, // Will be set during parsing
      headers: csvHeaders,
    };
  }

  /**
   * Create custom configuration from user input
   */
  createCustomConfig(
    fieldMappings: Record<string, string>,
    searchableColumns: string[],
    csvHeaders: string[],
  ): CsvConfig {
    return {
      connectorType: 'custom',
      fieldMappings,
      searchableColumns,
      totalRows: 0, // Will be set during parsing
      headers: csvHeaders,
    };
  }

  /**
   * Validate CSV headers against template requirements
   */
  validateHeaders(
    templateName: string,
    csvHeaders: string[],
  ): {
    isValid: boolean;
    missingColumns: string[];
    extraColumns: string[];
  } {
    const template = this.getTemplate(templateName);
    if (!template) {
      return {
        isValid: false,
        missingColumns: [],
        extraColumns: csvHeaders,
      };
    }

    const requiredColumns = [
      ...template.searchableColumns,
      ...template.metadataColumns,
    ];

    const csvHeadersLower = csvHeaders.map((h) => h.toLowerCase().trim());
    const requiredColumnsLower = requiredColumns.map((c) =>
      c.toLowerCase().trim(),
    );

    const missingColumns = requiredColumns.filter(
      (col) => !csvHeadersLower.includes(col.toLowerCase().trim()),
    );

    const extraColumns = csvHeaders.filter(
      (header) => !requiredColumnsLower.includes(header.toLowerCase().trim()),
    );

    return {
      isValid: missingColumns.length === 0,
      missingColumns,
      extraColumns,
    };
  }
}
