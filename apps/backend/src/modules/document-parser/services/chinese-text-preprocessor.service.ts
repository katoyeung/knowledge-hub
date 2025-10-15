import { Injectable, Logger } from '@nestjs/common';
import { DetectorService } from '../../../common/services/detector.service';

/**
 * Chinese Text Preprocessor Service
 * Handles cleaning and normalization of Chinese text extracted from PDFs
 */
@Injectable()
export class ChineseTextPreprocessorService {
  private readonly logger = new Logger(ChineseTextPreprocessorService.name);

  constructor(private readonly detectorService: DetectorService) {}

  /**
   * Detect and convert encoding for Chinese text
   * This method is now simplified since encoding detection is handled by DetectorService
   */
  detectAndConvertEncoding(text: string): string {
    // The encoding detection is now handled by the DetectorService
    // This method is kept for backward compatibility but just returns the text
    // as it should already be properly encoded when it reaches this point
    return text;
  }

  /**
   * Main preprocessing method for Chinese text
   */
  preprocessChineseText(rawText: string): string {
    if (!rawText || rawText.trim().length === 0) {
      return '';
    }

    this.logger.debug(
      `Preprocessing Chinese text of length: ${rawText.length}`,
    );

    // Step 0: Detect and convert encoding if needed
    let processedText = this.detectAndConvertEncoding(rawText);

    // Step 1: Fix excessive whitespace and scattered spacing
    processedText = this.normalizeWhitespace(processedText);

    // Step 2: Fix line breaks and paragraph structure
    processedText = this.fixLineBreaks(processedText);

    // Step 3: Clean up formatting artifacts
    processedText = this.removeFormattingArtifacts(processedText);

    // Step 4: Normalize Chinese punctuation
    processedText = this.normalizeChinesePunctuation(processedText);

    // Step 5: Handle numbering and bullet points
    processedText = this.normalizeNumbering(processedText);

    // Step 6: Final cleanup
    processedText = this.finalCleanup(processedText);

    this.logger.debug(`Preprocessed text length: ${processedText.length}`);
    return processedText;
  }

  /**
   * Normalize excessive whitespace and scattered character spacing
   */
  private normalizeWhitespace(text: string): string {
    return (
      text
        // Remove excessive spaces between Chinese characters
        .replace(/(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, '')
        // Remove spaces around Chinese punctuation
        .replace(/\s*([，。；：！？、）】〉》」』])\s*/g, '$1')
        .replace(/\s*([（【〈《「『])\s*/g, '$1')
        // Normalize multiple spaces to single space
        .replace(/[ \t]+/g, ' ')
        // Remove trailing spaces at line ends
        .replace(/[ \t]+$/gm, '')
        // Remove leading spaces at line starts (except for intentional indentation)
        .replace(/^[ \t]+/gm, '')
    );
  }

  /**
   * Fix line breaks and paragraph structure
   */
  private fixLineBreaks(text: string): string {
    return (
      text
        // Remove single line breaks within sentences (common PDF parsing issue)
        .replace(/(?<=[\u4e00-\u9fff])\n(?=[\u4e00-\u9fff])/g, '')
        // Preserve line breaks after punctuation
        .replace(/([。！？；])\n/g, '$1\n\n')
        // Remove excessive empty lines
        .replace(/\n{3,}/g, '\n\n')
        // Fix broken sentences across lines
        .replace(/(?<=[\u4e00-\u9fff，、])\n+(?=[\u4e00-\u9fff])/g, '')
        // Ensure proper spacing after periods when followed by Chinese text
        .replace(/([。！？])(?=[\u4e00-\u9fff])/g, '$1\n')
    );
  }

  /**
   * Remove formatting artifacts from PDF extraction
   */
  private removeFormattingArtifacts(text: string): string {
    return (
      text
        // Remove scattered page numbers and references
        .replace(/^\s*\d+\s*$/gm, '')
        // Remove isolated numbers on their own lines
        .replace(/^\s*\d{1,3}\s*$/gm, '')
        // Remove repeated patterns of spaces and special characters
        .replace(/[\s\u00A0]+/g, ' ')
        // Remove non-breaking spaces
        .replace(/\u00A0/g, ' ')
        // Remove excessive punctuation repetition
        .replace(/([。！？]){2,}/g, '$1')
        // Remove standalone parentheses or brackets
        .replace(/^\s*[（）【】〈〉《》「」『』]\s*$/gm, '')
        // Remove lines with only whitespace and punctuation
        .replace(/^[\s，。；：！？、（）【】〈〉《》「」『』]+$/gm, '')
    );
  }

  /**
   * Normalize Chinese punctuation
   */
  private normalizeChinesePunctuation(text: string): string {
    return (
      text
        // Convert full-width numbers to half-width in contexts
        .replace(/(\d)[\s]*([。，])/g, '$1$2')
        // Ensure proper spacing around English text within Chinese
        .replace(/(?<=[\u4e00-\u9fff])([A-Za-z])/g, ' $1')
        .replace(/([A-Za-z])(?=[\u4e00-\u9fff])/g, '$1 ')
        // Fix mixed punctuation
        .replace(/([，。；：！？])([A-Za-z])/g, '$1 $2')
        // Normalize quotation marks
        .replace(/"/g, '「')
        .replace(/"/g, '」')
        // Fix spacing around numbers
        .replace(/(?<=[\u4e00-\u9fff])(\d)/g, ' $1')
        .replace(/(\d)(?=[\u4e00-\u9fff])/g, '$1 ')
    );
  }

  /**
   * Normalize numbering and bullet points
   */
  private normalizeNumbering(text: string): string {
    return (
      text
        // Fix scattered numbering (common in PDF extraction)
        .replace(/(\d+)\s*\.\s*(\d+)\s*\.\s*(\d+)/g, '$1.$2.$3')
        .replace(/(\d+)\s*\.\s*(\d+)/g, '$1.$2')
        // Fix Roman numerals
        .replace(/([ivxlcdm]+)\s*\)/gi, '$1)')
        // Fix Chinese numbering
        .replace(/([一二三四五六七八九十]+)\s*[、。]/g, '$1、')
        // Fix parenthetical numbering
        .replace(/\(\s*(\d+)\s*\)/g, '($1)')
        // Fix bullet points
        .replace(/^\s*[•·▪▫◦‣⁃]\s*/gm, '• ')
    );
  }

  /**
   * Final cleanup pass
   */
  private finalCleanup(text: string): string {
    // Handle edge case: if text is only punctuation, preserve it
    if (/^[。！？；，、：；""''（）【】《》〈〉「」『』\s]*$/.test(text)) {
      return text.replace(/\s+/g, '');
    }

    return (
      text
        // Remove empty lines at start and end
        .replace(/^\s*\n+/, '')
        .replace(/\n+\s*$/, '')
        // Remove all empty lines throughout the text
        .replace(/\n\s*\n/g, '\n')
        // Remove lines with only whitespace
        .replace(/^\s*$/gm, '')
        // Ensure single space between sentences
        .replace(/([。！？])\s*(?=[\u4e00-\u9fff])/g, '$1 ')
        // Fix spacing around numbers - keep numbers close to text
        .replace(/(\d+)\s+([條章節項目])/g, '$1$2')
        .replace(/([第])\s+(\d+)/g, '$1$2')
        // Remove excessive whitespace within lines
        .replace(/\s{2,}/g, ' ')
        // Split, trim, and filter empty lines
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join(' ')
        // Final whitespace normalization
        .replace(/\s+/g, ' ')
        .trim()
    );
  }

  /**
   * Detect if text is primarily Chinese
   */
  isChineseText(text: string): boolean {
    const chineseCharCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const totalCharCount = text.replace(/\s/g, '').length;
    return totalCharCount > 0 && chineseCharCount / totalCharCount > 0.15;
  }

  /**
   * Split Chinese text into meaningful chunks with better size utilization
   */
  splitChineseText(
    text: string,
    maxChunkSize: number = 1000,
    overlapSize: number = 100,
  ): string[] {
    if (!this.isChineseText(text)) {
      return this.fallbackSplit(text, maxChunkSize, overlapSize);
    }

    this.logger.debug(
      `Splitting Chinese text: ${text.length} chars, maxChunkSize: ${maxChunkSize}, overlap: ${overlapSize}`,
    );

    const chunks: string[] = [];
    const paragraphs = text.split('\n\n').filter((p) => p.trim().length > 0);

    let currentChunk = '';

    for (const paragraph of paragraphs) {
      const potentialChunk = currentChunk
        ? `${currentChunk}\n\n${paragraph}`
        : paragraph;

      if (potentialChunk.length <= maxChunkSize) {
        currentChunk = potentialChunk;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
          this.logger.debug(
            `Created Chinese chunk ${chunks.length}: ${currentChunk.length} chars`,
          );

          // Handle overlap
          if (overlapSize > 0 && currentChunk.length > overlapSize) {
            const overlapText = this.getLastSentences(
              currentChunk,
              overlapSize,
            );
            currentChunk = `${overlapText}\n\n${paragraph}`;
          } else {
            currentChunk = paragraph;
          }
        } else {
          // Single paragraph is too long, split by sentences
          const sentences = this.splitBySentences(paragraph);
          const remainingChunk = this.buildChunksFromSentences(
            sentences,
            maxChunkSize,
            overlapSize,
            chunks,
          );
          currentChunk = remainingChunk;
        }
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk);
      this.logger.debug(
        `Created final Chinese chunk: ${currentChunk.length} chars`,
      );
    }

    // Remove duplicate chunks (same content)
    const uniqueChunks = [];
    const seenContent = new Set();

    for (const chunk of chunks) {
      const trimmedContent = chunk.trim();
      if (trimmedContent.length > 0 && !seenContent.has(trimmedContent)) {
        seenContent.add(trimmedContent);
        uniqueChunks.push(chunk);
      }
    }

    this.logger.debug(
      `Chinese text splitting completed: ${uniqueChunks.length} chunks, avg size: ${uniqueChunks.reduce((sum, chunk) => sum + chunk.length, 0) / uniqueChunks.length}`,
    );
    return uniqueChunks;
  }

  /**
   * Split text by Chinese sentence boundaries
   */
  private splitBySentences(text: string): string[] {
    return text
      .split(/([。！？；][\s]*)/g)
      .reduce((acc: string[], part, index) => {
        if (index % 2 === 0) {
          // Text part
          if (part.trim()) {
            acc.push(part.trim());
          }
        } else {
          // Punctuation part - append to last sentence
          if (acc.length > 0) {
            acc[acc.length - 1] += part;
          }
        }
        return acc;
      }, [])
      .filter((sentence) => sentence.trim().length > 0);
  }

  /**
   * Get last few sentences up to maxLength
   */
  private getLastSentences(text: string, maxLength: number): string {
    const sentences = this.splitBySentences(text);
    let result = '';

    for (let i = sentences.length - 1; i >= 0; i--) {
      const potential = sentences[i] + (result ? ' ' + result : '');
      if (potential.length <= maxLength) {
        result = potential;
      } else {
        break;
      }
    }

    return result;
  }

  /**
   * Build chunks from sentences array
   */
  private buildChunksFromSentences(
    sentences: string[],
    maxChunkSize: number,
    overlapSize: number,
    chunks: string[],
  ): string {
    let currentChunk = '';
    const minChunkSize = Math.max(50, maxChunkSize * 0.1); // Minimum 10% of max size or 50 chars

    for (const sentence of sentences) {
      const potentialChunk = currentChunk
        ? `${currentChunk} ${sentence}`
        : sentence;

      if (potentialChunk.length <= maxChunkSize) {
        currentChunk = potentialChunk;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);

          // Handle overlap
          if (overlapSize > 0) {
            const overlapText = this.getLastSentences(
              currentChunk,
              overlapSize,
            );
            currentChunk = overlapText
              ? `${overlapText} ${sentence}`
              : sentence;
          } else {
            currentChunk = sentence;
          }
        } else {
          currentChunk = sentence;
        }
      }
    }

    // If the remaining chunk is too small and we have previous chunks, merge it
    if (
      currentChunk &&
      currentChunk.length < minChunkSize &&
      chunks.length > 0
    ) {
      const lastChunk = chunks[chunks.length - 1];
      chunks[chunks.length - 1] = lastChunk + ' ' + currentChunk;
      return '';
    }

    return currentChunk;
  }

  /**
   * Fallback splitting for non-Chinese text
   */
  private fallbackSplit(
    text: string,
    maxChunkSize: number,
    overlapSize: number,
  ): string[] {
    const chunks: string[] = [];
    let start = 0;
    const minChunkSize = Math.max(50, maxChunkSize * 0.1); // Minimum 10% of max size or 50 chars

    while (start < text.length) {
      const end = Math.min(start + maxChunkSize, text.length);
      const chunk = text.slice(start, end);

      // If this is the last chunk and it's too small, merge with previous chunk
      if (
        chunks.length > 0 &&
        chunk.length < minChunkSize &&
        end === text.length
      ) {
        const lastChunk = chunks[chunks.length - 1];
        chunks[chunks.length - 1] = lastChunk + chunk;
      } else {
        chunks.push(chunk);
      }

      start = end - overlapSize;

      if (start >= end) break;
    }

    return chunks.filter((chunk) => chunk.trim().length > 0);
  }
}
