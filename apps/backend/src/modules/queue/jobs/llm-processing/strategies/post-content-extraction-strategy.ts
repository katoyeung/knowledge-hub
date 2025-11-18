import { Injectable } from '@nestjs/common';
import { ContentExtractionStrategy } from '../interfaces/content-extraction-strategy.interface';
import { Post } from '../../../../posts/entities/post.entity';

/**
 * Content extraction strategy for Post entities
 * Extracts content and template variables from Post for LLM processing
 */
@Injectable()
export class PostContentExtractionStrategy
  implements ContentExtractionStrategy<Post>
{
  getEntityType(): string {
    return 'post';
  }

  extractContent(post: Post): string {
    const parts: string[] = [];

    if (post.title) {
      parts.push(`Title: ${post.title}`);
    }

    if (post.meta?.content) {
      parts.push(`Content: ${post.meta.content}`);
    }

    if (post.source) {
      parts.push(`Source: ${post.source}`);
    }

    if (post.provider) {
      parts.push(`Provider: ${post.provider}`);
    }

    if (post.postedAt) {
      parts.push(`Posted At: ${post.postedAt.toISOString()}`);
    }

    // Add any other relevant meta fields
    if (post.meta) {
      const metaFields = Object.entries(post.meta)
        .filter(([key]) => key !== 'content')
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);

      if (metaFields.length > 0) {
        parts.push(`Additional Metadata:\n${metaFields.join('\n')}`);
      }
    }

    return parts.join('\n\n');
  }

  getEntityId(post: Post): string {
    return post.id;
  }

  extractTemplateVariables(post: Post): Record<string, string> {
    const variables: Record<string, string> = {};

    if (post.title) {
      variables.title = post.title;
    }

    if (post.source) {
      variables.source = post.source;
    }

    if (post.provider) {
      variables.provider = post.provider;
    }

    if (post.postedAt) {
      variables.postedAt = post.postedAt.toISOString();
      variables.date = post.postedAt.toISOString();
    }

    // Extract common meta fields as template variables
    if (post.meta) {
      if (post.meta.content) {
        variables.content = post.meta.content;
      }
      if (post.meta.author) {
        variables.author = String(post.meta.author);
      }
      if (post.meta.platform) {
        variables.platform = String(post.meta.platform);
      }
      if (post.meta.engagement) {
        variables.engagement = String(post.meta.engagement);
      }
    }

    return variables;
  }
}
