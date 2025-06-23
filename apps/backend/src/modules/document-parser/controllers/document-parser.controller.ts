import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpStatus,
  HttpException,
  Logger,
  UploadedFile,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  RagflowPdfParserService,
  EmbeddingOptimizedConfig,
} from '../services/ragflow-pdf-parser.service';
import { SimplePdfParserService } from '../services/simple-pdf-parser.service';
import { ParsePdfDto } from '../dto/parse-pdf.dto';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import { validate } from 'class-validator';
import { plainToInstance, classToPlain } from 'class-transformer';
import {
  EmbeddingModel,
  TextSplitter,
} from '../../dataset/dto/create-dataset-step.dto';
import { Transform } from 'class-transformer';
import { ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

// Export ParsePdfDto for tests
export { ParsePdfDto };

class EmbeddingOptimizedParseDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  })
  @ValidateNested()
  @Type(() => Object)
  embeddingConfig?: {
    model: EmbeddingModel;
    customModelName?: string;
    provider: string;
    textSplitter: TextSplitter;
    chunkSize: number;
    chunkOverlap: number;
    separators?: string[];
    confidenceThreshold?: number;
    enableTableExtraction?: boolean;
    enableImageExtraction?: boolean;
  };

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  })
  @ValidateNested()
  @Type(() => Object)
  options?: {
    extractionMethod?: 'deepdoc' | 'naive' | 'hybrid';
    enableTableExtraction?: boolean;
    enableImageExtraction?: boolean;
    segmentationStrategy?: 'paragraph' | 'sentence' | 'semantic' | 'hybrid';
    maxSegmentLength?: number;
    minSegmentLength?: number;
    overlapRatio?: number;
    confidenceThreshold?: number;
  };
}

@Controller('document-parser')
@UseGuards(JwtAuthGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: false, // Allow extra fields in form data
    validatorPackage: { validate },
    transformerPackage: { plainToInstance, classToPlain },
  }),
)
export class DocumentParserController {
  private readonly logger = new Logger(DocumentParserController.name);

  constructor(
    private readonly ragflowPdfParserService: RagflowPdfParserService,
    private readonly simplePdfParserService: SimplePdfParserService,
  ) {}

  @Post('parse-pdf')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/temp',
        filename: (req, file, callback) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          callback(
            null,
            `${file.fieldname}-${uniqueSuffix}${extname(file.originalname)}`,
          );
        },
      }),
      fileFilter: (req, file, callback) => {
        if (file.mimetype === 'application/pdf') {
          callback(null, true);
        } else {
          callback(
            new HttpException(
              'Only PDF files are allowed',
              HttpStatus.BAD_REQUEST,
            ),
            false,
          );
        }
      },
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
      },
    }),
  )
  async parsePdf(
    @UploadedFile() file: Express.Multer.File,
    @Body() parseDto: ParsePdfDto,
  ) {
    const startTime = Date.now();

    try {
      if (!file && !parseDto.filePath) {
        throw new HttpException('No file provided', HttpStatus.BAD_REQUEST);
      }

      const filePath = file?.path || parseDto.filePath;
      if (!filePath) {
        throw new HttpException('Invalid file path', HttpStatus.BAD_REQUEST);
      }

      this.logger.log(`Starting RAGFlow PDF parsing for: ${filePath}`);

      const result = await this.ragflowPdfParserService.parsePdf(
        filePath,
        parseDto.options,
      );

      // Clean up temporary file if uploaded
      if (file?.path) {
        try {
          fs.unlinkSync(file.path);
        } catch (cleanupError) {
          this.logger.warn(
            `Failed to cleanup temp file: ${cleanupError.message}`,
          );
        }
      }

      const processingTime = Date.now() - startTime;
      this.logger.log(`RAGFlow PDF parsing completed in ${processingTime}ms`);

      return {
        success: result.success,
        data: result,
        meta: {
          processingTime,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      // Clean up temporary file on error
      if (file?.path) {
        try {
          fs.unlinkSync(file.path);
        } catch (cleanupError) {
          this.logger.warn(
            `Failed to cleanup temp file on error: ${cleanupError.message}`,
          );
        }
      }

      this.logger.error(
        `RAGFlow PDF parsing failed: ${error.message}`,
        error.stack,
      );

      throw new HttpException(
        {
          success: false,
          message: 'PDF parsing failed',
          error: error.message,
          timestamp: new Date().toISOString(),
        },
        error instanceof HttpException
          ? error.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('parse-pdf-from-path')
  async parsePdfFromPath(@Body() parseDto: ParsePdfDto) {
    const startTime = Date.now();

    try {
      if (!parseDto.filePath) {
        throw new HttpException(
          'File path is required',
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(`Starting RAGFlow PDF parsing for: ${parseDto.filePath}`);

      const result = await this.ragflowPdfParserService.parsePdf(
        parseDto.filePath,
        parseDto.options,
      );

      const processingTime = Date.now() - startTime;
      this.logger.log(`RAGFlow PDF parsing completed in ${processingTime}ms`);

      return {
        success: result.success,
        data: result,
        meta: {
          processingTime,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger.error(
        `RAGFlow PDF parsing failed: ${error.message}`,
        error.stack,
      );

      throw new HttpException(
        {
          success: false,
          message: 'PDF parsing failed',
          error: error.message,
          timestamp: new Date().toISOString(),
        },
        error instanceof HttpException
          ? error.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Simple PDF Content Extraction - Upload File
   *
   * Upload a PDF file and get back the raw text content with basic metadata.
   * This is a simpler alternative to the full RAGFlow analysis.
   */
  @Post('extract-pdf-content')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/temp',
        filename: (req, file, callback) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          callback(
            null,
            `${file.fieldname}-${uniqueSuffix}${extname(file.originalname)}`,
          );
        },
      }),
      fileFilter: (req, file, callback) => {
        if (file.mimetype === 'application/pdf') {
          callback(null, true);
        } else {
          callback(
            new HttpException(
              'Only PDF files are allowed',
              HttpStatus.BAD_REQUEST,
            ),
            false,
          );
        }
      },
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
      },
    }),
  )
  async extractPdfContent(@UploadedFile() file: Express.Multer.File) {
    const startTime = Date.now();

    try {
      if (!file) {
        throw new HttpException('No file provided', HttpStatus.BAD_REQUEST);
      }

      this.logger.log(
        `Starting simple PDF content extraction for: ${file.originalname}`,
      );

      const result = await this.simplePdfParserService.extractTextFromPdf(
        file.path,
      );

      // Clean up temporary file
      try {
        fs.unlinkSync(file.path);
      } catch (cleanupError) {
        this.logger.warn(
          `Failed to cleanup temp file: ${cleanupError.message}`,
        );
      }

      const processingTime = Date.now() - startTime;
      this.logger.log(
        `PDF content extraction completed in ${processingTime}ms`,
      );

      return {
        success: result.success,
        content: result.content,
        metadata: result.metadata,
        errors: result.errors,
        meta: {
          processingTime,
          timestamp: new Date().toISOString(),
          originalFilename: file.originalname,
        },
      };
    } catch (error) {
      // Clean up temporary file on error
      if (file?.path) {
        try {
          fs.unlinkSync(file.path);
        } catch (cleanupError) {
          this.logger.warn(
            `Failed to cleanup temp file on error: ${cleanupError.message}`,
          );
        }
      }

      this.logger.error(
        `PDF content extraction failed: ${error.message}`,
        error.stack,
      );

      throw new HttpException(
        {
          success: false,
          message: 'PDF content extraction failed',
          error: error.message,
          timestamp: new Date().toISOString(),
        },
        error instanceof HttpException
          ? error.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Simple PDF Content Extraction - From Buffer
   *
   * Extract text content directly from uploaded file buffer without saving to disk.
   * This is more memory efficient for smaller files.
   */
  @Post('extract-pdf-content-buffer')
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: (req, file, callback) => {
        if (file.mimetype === 'application/pdf') {
          callback(null, true);
        } else {
          callback(
            new HttpException(
              'Only PDF files are allowed',
              HttpStatus.BAD_REQUEST,
            ),
            false,
          );
        }
      },
      limits: {
        fileSize: 20 * 1024 * 1024, // 20MB limit for buffer processing
      },
    }),
  )
  async extractPdfContentFromBuffer(@UploadedFile() file: Express.Multer.File) {
    const startTime = Date.now();

    try {
      if (!file) {
        throw new HttpException('No file provided', HttpStatus.BAD_REQUEST);
      }

      this.logger.log(
        `Starting buffer-based PDF content extraction for: ${file.originalname}`,
      );

      const result = await this.simplePdfParserService.extractTextFromBuffer(
        file.buffer,
      );

      const processingTime = Date.now() - startTime;
      this.logger.log(
        `PDF content extraction completed in ${processingTime}ms`,
      );

      return {
        success: result.success,
        content: result.content,
        metadata: result.metadata,
        errors: result.errors,
        meta: {
          processingTime,
          timestamp: new Date().toISOString(),
          originalFilename: file.originalname,
        },
      };
    } catch (error) {
      this.logger.error(
        `PDF content extraction failed: ${error.message}`,
        error.stack,
      );

      throw new HttpException(
        {
          success: false,
          message: 'PDF content extraction failed',
          error: error.message,
          timestamp: new Date().toISOString(),
        },
        error instanceof HttpException
          ? error.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Admin/Test endpoint for health checking
   */
  @Post('admin/test')
  @UseGuards() // Remove JwtAuthGuard for testing
  adminTest() {
    return {
      success: true,
      message: 'Document parser service is healthy',
      timestamp: new Date().toISOString(),
      endpoints: [
        'POST /document-parser/parse-pdf - RAGFlow advanced PDF parsing',
        'POST /document-parser/parse-pdf-from-path - RAGFlow parsing from server path',
        'POST /document-parser/extract-pdf-content - Simple PDF content extraction',
        'POST /document-parser/extract-pdf-content-buffer - Buffer-based PDF extraction',
      ],
    };
  }

  /**
   * Parse PDF with embedding-optimized configuration
   * This endpoint integrates RAGFlow parsing with your embedding configuration
   * for optimal RAG performance
   */
  @Post('parse-pdf-embedding-optimized')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/temp',
        filename: (req, file, callback) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          callback(
            null,
            `${file.fieldname}-${uniqueSuffix}${extname(file.originalname)}`,
          );
        },
      }),
      fileFilter: (req, file, callback) => {
        if (file.mimetype === 'application/pdf') {
          callback(null, true);
        } else {
          callback(
            new HttpException(
              'Only PDF files are allowed',
              HttpStatus.BAD_REQUEST,
            ),
            false,
          );
        }
      },
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
      },
    }),
  )
  async parsePdfWithEmbeddingConfig(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: EmbeddingOptimizedParseDto,
  ) {
    const startTime = Date.now();

    try {
      if (!body.embeddingConfig) {
        throw new BadRequestException('Embedding configuration is required');
      }

      // Validate embedding configuration
      const embeddingConfig: EmbeddingOptimizedConfig = {
        model: body.embeddingConfig.model,
        customModelName: body.embeddingConfig.customModelName,
        provider: body.embeddingConfig.provider || 'default',
        textSplitter: body.embeddingConfig.textSplitter,
        chunkSize: body.embeddingConfig.chunkSize,
        chunkOverlap: body.embeddingConfig.chunkOverlap,
        separators: body.embeddingConfig.separators,
        confidenceThreshold: body.embeddingConfig.confidenceThreshold || 0.7,
        enableTableExtraction:
          body.embeddingConfig.enableTableExtraction ?? true,
        enableImageExtraction:
          body.embeddingConfig.enableImageExtraction ?? false,
      };

      this.logger.log(`🤖 Starting embedding-optimized PDF parsing:
        - File: ${file.originalname} (${(file.size / 1024 / 1024).toFixed(2)}MB)
        - Embedding Model: ${embeddingConfig.model}
        - Text Splitter: ${embeddingConfig.textSplitter}
        - Chunk Size: ${embeddingConfig.chunkSize}
        - Chunk Overlap: ${embeddingConfig.chunkOverlap}`);

      try {
        // Use the uploaded file path directly (file is already saved by multer)
        const result =
          await this.ragflowPdfParserService.parsePdfWithEmbeddingConfig(
            file.path,
            embeddingConfig,
            body.options,
          );

        // Enhance metadata with embedding information
        const enhancedResult = {
          ...result,
          metadata: {
            ...result.metadata,
            embeddingOptimized: true,
            chunkingStrategy: embeddingConfig.textSplitter,
            embeddingModel: embeddingConfig.model,
            chunkSize: embeddingConfig.chunkSize,
            chunkOverlap: embeddingConfig.chunkOverlap,
          },
        };

        this.logger.log(`✅ Embedding-optimized parsing completed:
          - Segments: ${result.segments.length}
          - Tables: ${result.tables.length}
          - Processing Time: ${result.metadata.processingTime}ms
          - Average Confidence: ${(result.segments.reduce((sum, s) => sum + s.confidence, 0) / result.segments.length).toFixed(3)}`);

        return {
          success: true,
          data: enhancedResult,
          meta: {
            processingTime: Date.now() - startTime,
            timestamp: new Date().toISOString(),
          },
        };
      } finally {
        // Clean up temporary file
        try {
          if (file?.path) {
            fs.unlinkSync(file.path);
          }
        } catch (cleanupError) {
          this.logger.warn(
            `Failed to cleanup temp file: ${cleanupError.message}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `❌ Embedding-optimized parsing failed: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        `Failed to parse PDF: ${error.message}`,
      );
    }
  }
}
