import { Injectable } from '@nestjs/common';
import { Post } from '../../posts/entities/post.entity';

/**
 * Service for transforming post data into segment content
 * Handles the logic for converting post meta fields (thread_title, post_message, etc.)
 * into a single content string suitable for document segments
 */
@Injectable()
export class PostContentTransformerService {
  /**
   * Transforms a post into content string for document segments
   *
   * Priority order:
   * 1. If post_message exists:
   *    - If thread_title exists and post_message doesn't contain it → concatenate thread_title + post_message
   *    - Otherwise → use post_message as-is
   * 2. If thread_title exists (but post_message doesn't) → use thread_title
   * 3. Fallback: meta.content → title → default message
   *
   * @param post - The post entity to transform
   * @returns The transformed content string
   */
  transformPostToContent(post: Post): string {
    const threadTitle = post.meta?.thread_title;
    const postMessage = post.meta?.post_message;

    if (postMessage) {
      // If post_message exists, check if it contains thread_title
      const threadTitleInMessage = threadTitle
        ? postMessage.toLowerCase().includes(threadTitle.toLowerCase())
        : false;

      if (threadTitle && !threadTitleInMessage) {
        // Concatenate thread_title + post_message
        return `${threadTitle}\n\n${postMessage}`;
      } else {
        // Use post_message as-is if it already contains thread_title or thread_title is missing
        return postMessage;
      }
    } else if (threadTitle) {
      // If post_message doesn't exist but thread_title exists, use thread_title
      return threadTitle;
    } else {
      // Fallback to existing logic
      return (
        post.meta?.content ||
        post.title ||
        `Post from ${post.source || 'unknown'}`
      );
    }
  }

  /**
   * Checks if post_message contains thread_title (case-insensitive)
   *
   * @param postMessage - The post message content
   * @param threadTitle - The thread title to check for
   * @returns true if postMessage contains threadTitle
   */
  containsThreadTitle(postMessage: string, threadTitle: string): boolean {
    return postMessage.toLowerCase().includes(threadTitle.toLowerCase());
  }
}
