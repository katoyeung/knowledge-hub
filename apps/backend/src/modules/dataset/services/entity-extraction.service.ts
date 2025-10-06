import { Injectable, Logger } from '@nestjs/common';

export interface EntityExtractionResult {
  entities: string[];
  confidence: number;
  processingTimeMs: number;
  method: 'llm' | 'ngram';
  modelUsed?: string;
}

export interface EntityExtractionConfig {
  method: 'llm' | 'ngram' | 'auto';
  maxEntities?: number;
  minConfidence?: number;
  enablePerformanceLogging?: boolean;
  enableTextNormalization?: boolean;
  customPatterns?: Array<{
    pattern: RegExp;
    type: string;
    maxLength?: number;
  }>;
}

@Injectable()
export class EntityExtractionService {
  private readonly logger = new Logger(EntityExtractionService.name);
  private modelCache: Map<string, any> = new Map();
  private isModelLoading = false;

  // Primary model for Chinese NER
  private readonly CHINESE_NER_MODEL = 'Xenova/bert-base-chinese-ner';
  // Fallback multilingual model
  private readonly MULTILINGUAL_NER_MODEL =
    'Xenova/bert-base-multilingual-cased-ner-hrl';
  private readonly DEFAULT_MAX_ENTITIES = 10;
  private readonly DEFAULT_MIN_CONFIDENCE = 0.5;

  private pipe: any = null;
  private currentModel: string = this.CHINESE_NER_MODEL;

  /**
   * Generic text normalization for better NER performance
   */
  private normalizeText(text: string): string {
    if (!text) return text;

    let normalized = text;

    // 1. Fix spacing issues in legal/formal references
    // Handle spaced numbers: "第1 9條" → "第19條"
    normalized = normalized.replace(
      /第\s*(\d+)(?:\s+(\d+))*\s*([條章])/g,
      (match, num1, num2, suffix) => {
        const fullNumber = num2 ? num1 + num2 : num1;
        return `第${fullNumber}${suffix}`;
      },
    );

    // 2. Fix spacing in parentheses: "( b ) ( i v)" → "(b)(iv)"
    normalized = normalized.replace(/\(\s*([^)]+)\s*\)/g, (match, content) => {
      const cleanContent = content.replace(/\s+/g, '');
      return `(${cleanContent})`;
    });

    // 3. Normalize measurement spacing: "24 米" → "24米"
    normalized = normalized.replace(
      /(\d+)\s+(毫米|米|毫|m|mm|公里|km|元|港元|美元)/gi,
      '$1$2',
    );

    // 4. Clean up excessive whitespace
    normalized = normalized.replace(/\s+/g, ' ').trim();

    return normalized;
  }

  /**
   * Minimal post-processing patterns (only for common issues)
   */
  private getCommonPatterns(): Array<{
    pattern: RegExp;
    type: string;
    maxLength?: number;
  }> {
    return [
      // Legal documents (common in many domains)
      {
        pattern: /《[^》]+》/g,
        type: 'DOCUMENT',
        maxLength: 30,
      },
      // Measurements (universal)
      {
        pattern: /\d+(?:毫米|米|毫|m|mm|公里|km|元|港元|美元|GB|MB|KB|TB)/gi,
        type: 'MEASUREMENT',
        maxLength: 15,
      },
      // Dates (universal)
      {
        pattern: /\d{4}年\d{1,2}月\d{1,2}日/g,
        type: 'DATE',
        maxLength: 12,
      },
    ];
  }

  async extractEntities(
    text: string,
    config: EntityExtractionConfig,
  ): Promise<EntityExtractionResult> {
    const startTime = Date.now();
    const method = config.method || 'auto';
    const maxEntities = config.maxEntities || this.DEFAULT_MAX_ENTITIES;

    try {
      if (method === 'llm' || method === 'auto') {
        if (!this.pipe) {
          await this.initializePipeline();
        }
        return await this.extractEntitiesWithLLM(
          text,
          maxEntities,
          startTime,
          config,
        );
      }
    } catch (error) {
      this.logger.warn('LLM extraction failed, falling back to n-gram:', error);
      if (method === 'llm') {
        throw error;
      }
    }

    return this.extractEntitiesWithNGram(text, maxEntities, startTime);
  }

  private async initializePipeline(): Promise<void> {
    try {
      this.logger.log(
        `Initializing NER pipeline with model: ${this.currentModel}`,
      );
      const { pipeline } = await import('@xenova/transformers');
      this.pipe = await pipeline('token-classification', this.currentModel);
      this.logger.log('Successfully initialized Chinese NER pipeline');
    } catch (error) {
      this.logger.warn(
        `Failed to initialize ${this.currentModel}, trying multilingual fallback:`,
        error,
      );
      try {
        this.currentModel = this.MULTILINGUAL_NER_MODEL;
        const { pipeline } = await import('@xenova/transformers');
        this.pipe = await pipeline('token-classification', this.currentModel);
        this.logger.log('Successfully initialized multilingual NER pipeline');
      } catch (fallbackError) {
        this.logger.error(
          'Failed to initialize both NER models:',
          fallbackError,
        );
        throw fallbackError;
      }
    }
  }

  private async extractEntitiesWithLLM(
    text: string,
    maxEntities: number,
    startTime: number,
    config?: EntityExtractionConfig,
  ): Promise<EntityExtractionResult> {
    try {
      if (!this.pipe) {
        await this.initializePipeline();
      }

      // 1. Normalize text for better NER performance
      const normalizedText =
        config?.enableTextNormalization !== false
          ? this.normalizeText(text)
          : text;

      if (config?.enablePerformanceLogging) {
        this.logger.log(
          `📝 Text normalization: ${text.length} → ${normalizedText.length} chars`,
        );
        if (text !== normalizedText) {
          this.logger.log(
            `📝 Normalization example: "${text.substring(0, 100)}..." → "${normalizedText.substring(0, 100)}..."`,
          );
        }
      }

      // 2. Get minimal common patterns + any custom patterns
      const commonPatterns = this.getCommonPatterns();
      const customPatterns = config?.customPatterns || [];
      const allPatterns = [...commonPatterns, ...customPatterns];

      // 3. Extract pattern-based entities first (minimal set)
      const patternEntities = new Set<string>();

      for (const { pattern, type, maxLength } of allPatterns) {
        const matches = normalizedText.matchAll(pattern);
        for (const match of matches) {
          const matchText = match[0].trim();

          if (type === 'DOCUMENT') {
            // Keep document names as-is
            if (matchText.startsWith('《') && matchText.endsWith('》')) {
              patternEntities.add(matchText);
            }
          } else if (type === 'MEASUREMENT' || type === 'DATE') {
            // Keep measurements and dates
            patternEntities.add(matchText);
          } else if (
            matchText.length >= 2 &&
            matchText.length <= (maxLength || 15)
          ) {
            patternEntities.add(matchText);
          }
        }
      }

      // 4. Split normalized text into manageable chunks for NER
      const chunks = this.splitTextIntoChunks(normalizedText, 512);
      const entities = new Set<string>();

      // Add pattern-based entities first
      patternEntities.forEach((entity) => entities.add(entity));

      // 5. Run NER on normalized text
      for (const chunk of chunks) {
        const nerResults = await this.pipe(chunk);

        if (Array.isArray(nerResults)) {
          const groupedEntities = this.groupNERTokens(nerResults);

          groupedEntities.forEach((entity) => {
            if (entity.text.length >= 2 && !this.isStopWord(entity.text)) {
              entities.add(entity.text);
            }
          });
        }
      }

      // 6. Minimal post-processing: remove redundant entities
      const finalEntities = Array.from(entities)
        .filter((entity) => {
          if (entity.length < 2) return false;
          if (this.isStopWord(entity)) return false;
          return true;
        })
        .filter((entity, index, array) => {
          // Remove entities that are substrings of longer entities
          const longerEntities = array.filter(
            (other) =>
              other !== entity &&
              other.length > entity.length &&
              other.includes(entity),
          );
          return longerEntities.length === 0 || patternEntities.has(entity);
        })
        .slice(0, maxEntities);

      // If no entities found, fall back to n-gram
      if (finalEntities.length === 0) {
        this.logger.warn('NER returned no entities, falling back to n-gram');
        return this.extractEntitiesWithNGram(text, maxEntities, startTime);
      }

      return {
        entities: finalEntities,
        confidence: 0.9,
        processingTimeMs: Date.now() - startTime,
        method: 'llm',
        modelUsed: this.currentModel,
      };
    } catch (error) {
      this.logger.warn('NER entity extraction failed:', error);
      throw error;
    }
  }

  private groupNERTokens(
    nerResults: any[],
  ): Array<{ text: string; label: string; confidence: number }> {
    const entities: Array<{ text: string; label: string; confidence: number }> =
      [];
    let currentEntity = { text: '', label: '', confidence: 0, count: 0 };

    for (const result of nerResults) {
      const label = result.entity || result.entity_group;
      const text = result.word;
      const confidence = result.score;

      // Skip if confidence is too low
      if (confidence < this.DEFAULT_MIN_CONFIDENCE) {
        continue;
      }

      // Handle B-I-E tagging scheme (Begin-Inside-End)
      const isBeginning = label?.startsWith('B-');
      const isInside = label?.startsWith('I-');
      const isEnd = label?.startsWith('E-');
      const entityType = label?.replace(/^[BIE]-/, '');

      // Check if this is a valid entity type
      const validEntityTypes = [
        'PER',
        'ORG',
        'LOC',
        'MISC',
        'LAW',
        'FAC',
        'RULE', // Standard + Legal
        'TECH',
        'AI',
        'DATA',
        'BUSINESS',
        'CURRENCY', // Technical + Business
        'DATE',
        'TIME',
        'MEASUREMENT',
        'QUANTITY', // General
      ];
      if (!validEntityTypes.includes(entityType)) {
        continue;
      }

      if (isBeginning || (isInside && !currentEntity.text)) {
        // Start new entity or continue if we don't have a current entity
        if (currentEntity.text && currentEntity.label !== entityType) {
          // Save previous entity if it's different type
          entities.push({
            text: currentEntity.text.trim(),
            label: currentEntity.label,
            confidence: currentEntity.confidence / currentEntity.count,
          });
        }

        if (isBeginning || !currentEntity.text) {
          currentEntity = {
            text: text.replace(/^##/, ''), // Remove BERT subword prefix
            label: entityType,
            confidence: confidence,
            count: 1,
          };
        } else {
          // Continue current entity
          currentEntity.text += text.replace(/^##/, '');
          currentEntity.confidence += confidence;
          currentEntity.count++;
        }
      } else if (
        (isInside || isEnd) &&
        currentEntity.text &&
        entityType === currentEntity.label
      ) {
        // Continue current entity, but check for natural breaks
        const newText = currentEntity.text + text.replace(/^##/, '');

        // If the entity is getting too long or contains natural breaks, split it
        if (newText.length > 15 || /》第|條第/.test(newText)) {
          // Save current entity
          entities.push({
            text: currentEntity.text.trim(),
            label: currentEntity.label,
            confidence: currentEntity.confidence / currentEntity.count,
          });

          // Start new entity with current token
          currentEntity = {
            text: text.replace(/^##/, ''),
            label: entityType,
            confidence: confidence,
            count: 1,
          };
        } else {
          // Continue current entity
          currentEntity.text = newText;
          currentEntity.confidence += confidence;
          currentEntity.count++;
        }

        // If this is the end marker, finalize the entity
        if (isEnd) {
          entities.push({
            text: currentEntity.text.trim(),
            label: currentEntity.label,
            confidence: currentEntity.confidence / currentEntity.count,
          });
          currentEntity = { text: '', label: '', confidence: 0, count: 0 };
        }
      } else {
        // End current entity and potentially start new one
        if (currentEntity.text) {
          entities.push({
            text: currentEntity.text.trim(),
            label: currentEntity.label,
            confidence: currentEntity.confidence / currentEntity.count,
          });
        }

        if (isBeginning) {
          currentEntity = {
            text: text.replace(/^##/, ''),
            label: entityType,
            confidence: confidence,
            count: 1,
          };
        } else {
          currentEntity = { text: '', label: '', confidence: 0, count: 0 };
        }
      }
    }

    // Don't forget the last entity
    if (currentEntity.text) {
      entities.push({
        text: currentEntity.text.trim(),
        label: currentEntity.label,
        confidence: currentEntity.confidence / currentEntity.count,
      });
    }

    // Sort by confidence and filter unique entities
    return entities
      .filter((entity) => {
        // Enhanced filtering for legal documents
        if (entity.text.length < 2) return false;
        if (entity.label === 'LEGAL_REF') return true;
        if (/^第\d+條/.test(entity.text)) return true;
        if (/^《.+》$/.test(entity.text)) return true;
        if (/^\d+\s*(毫米|米|毫|m|mm)$/i.test(entity.text)) return false; // Skip pure measurements
        return !this.isStopWord(entity.text);
      })
      .sort((a, b) => b.confidence - a.confidence);
  }

  private splitTextIntoChunks(text: string, maxLength: number): string[] {
    const chunks: string[] = [];

    // Split by legal document sections first
    const sections = text.split(/(?=\d+\s*\.\s*[^。！？；]+(?:：|:|$))/g);

    for (const section of sections) {
      if (section.length <= maxLength) {
        chunks.push(section.trim());
        continue;
      }

      // Split long sections by sentence boundaries
      const sentences = section
        .split(/(?<=[。！？；])/g)
        .map((s) => s.trim())
        .filter(Boolean);

      let currentChunk = '';
      for (const sentence of sentences) {
        // If sentence contains legal references, keep it whole
        if (
          /《[^》]+》/.test(sentence) ||
          /第\s*\d+\s*[條章]/.test(sentence) ||
          /「[^」]+」/.test(sentence)
        ) {
          if (currentChunk) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
          }
          chunks.push(sentence);
          continue;
        }

        if (currentChunk.length + sentence.length > maxLength) {
          if (currentChunk) {
            chunks.push(currentChunk.trim());
          }
          currentChunk = sentence;
        } else {
          currentChunk += (currentChunk ? '。' : '') + sentence;
        }
      }

      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
    }

    // If no chunks were created (very short text), return the original text
    return chunks.length > 0 ? chunks : [text];
  }

  private parseEntityResponse(
    responseText: string,
    maxEntities: number,
  ): string[] {
    try {
      // Clean up the response text
      const cleanText = responseText
        .replace(/<\|im_[^>]+\|>/g, '') // Remove chat markers
        .trim();

      // Split by various delimiters and clean up
      const entities = cleanText
        .split(/[，,、\n]/) // Split by Chinese/English commas, enumeration comma, and newlines
        .map((entity) => entity.trim())
        .filter((entity) => {
          // Keep only meaningful Chinese entities
          return (
            entity.length >= 2 && // At least 2 characters
            entity.length <= 15 && // Not too long
            /[\u4e00-\u9fff]/.test(entity) && // Contains Chinese characters
            !this.isStopWord(entity) // Not a stop word
          );
        })
        .slice(0, maxEntities);

      return entities;
    } catch (error) {
      this.logger.warn(`Failed to parse entity response: ${error.message}`);
      return [];
    }
  }

  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      '的',
      '是',
      '在',
      '有',
      '和',
      '或',
      '但',
      '於',
      '以',
      '及',
      '與',
      '而',
      '為',
      '若',
      '則',
      '須',
      '可',
      '應',
      '將',
      '把',
      '被',
      '由',
      '從',
      '對',
      '至',
      '到',
      '內',
      '中',
      '外',
      '上',
      '下',
      '前',
      '後',
      '間',
      '內',
      '該',
      '此',
      '這',
      '那',
      '其',
      '之',
      '者',
      '所',
      '任',
      '何',
      '如',
      '凡',
      '每',
      '各',
      '等',
      '某',
      '既',
      '即',
      '亦',
      '乃',
      '矣',
      '焉',
      '兮',
      '哉',
      '也',
      '耳',
      '夫',
      '盖',
      '然',
      '否',
      '未',
      '已',
      '且',
      '仍',
      '復',
      '嘗',
      '嘗',
      '常',
      '乎',
      '其',
      '若',
      '斯',
      '然',
      '則',
      '可',
      '乎',
      '哉',
      '矣',
      '云',
      '爾',
      '耳',
      '夫',
      '也',
    ]);

    // Don't treat legal references as stop words
    if (/^第\d+條/.test(word) || /^《.+》$/.test(word)) {
      return false;
    }

    return stopWords.has(word) || word.length < 2;
  }

  private extractEntitiesWithNGram(
    text: string,
    maxEntities: number,
    startTime: number,
  ): EntityExtractionResult {
    // Clean and normalize text
    const cleanText = text
      .replace(/[，。；：！？、（）【】《》〈〉「」『』""'']/g, ' ')
      .replace(/[^\u4e00-\u9fff\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const entities: { [key: string]: number } = {};

    // Extract 2-6 character terms (longer terms are more likely to be entities)
    for (let len = 2; len <= 6; len++) {
      for (let i = 0; i <= cleanText.length - len; i++) {
        const term = cleanText.substring(i, i + len);

        if (/^[\u4e00-\u9fff]+$/.test(term) && !this.isStopWord(term)) {
          // Longer terms get higher weight
          const weight = len > 3 ? 2 : 1;
          entities[term] = (entities[term] || 0) + weight;
        }
      }
    }

    // Sort by frequency and length preference
    const sortedEntities = Object.entries(entities)
      .sort(([a, freqA], [b, freqB]) => {
        // Prefer longer terms and higher frequency
        const scoreA = freqA * (a.length > 3 ? 1.5 : 1);
        const scoreB = freqB * (b.length > 3 ? 1.5 : 1);
        return scoreB - scoreA;
      })
      .slice(0, maxEntities)
      .map(([entity]) => entity);

    return {
      entities: sortedEntities,
      confidence: 0.6, // Base confidence for n-gram method
      processingTimeMs: Date.now() - startTime,
      method: 'ngram',
    };
  }
}
