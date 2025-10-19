import {
  Controller,
  UseGuards,
  UsePipes,
  ValidationPipe,
  Post,
  UseInterceptors,
  UploadedFiles,
  Body,
  Request,
  Patch,
  Param,
  Logger,
  BadRequestException,
  Get,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { DocumentService } from './document.service';
import { DocumentProcessingService } from './services/document-processing.service';
import {
  Crud,
  CrudController,
  Override,
  ParsedRequest,
  CrudRequest,
} from '@dataui/crud';
import { Document } from './entities/document.entity';
import { validate } from 'class-validator';
import { plainToInstance, classToPlain } from 'class-transformer';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { UploadDocumentDto } from './dto/create-dataset-step.dto';
import { Resource } from '@modules/access/enums/permission.enum';
import { CrudPermissions } from '@modules/access/decorators/crud-permissions.decorator';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ParseJsonStringsPipe } from '../../common/pipes/parse-json-strings.pipe';
import { PopulateUserIdInterceptor } from '@common/interceptors/populate-user-id.interceptor';

@Crud({
  model: {
    type: Document,
  },
  params: {
    id: {
      field: 'id',
      type: 'string',
      primary: true,
    },
  },
  query: {
    sort: [
      {
        field: 'createdAt',
        order: 'DESC',
      },
    ],
    join: {
      dataset: {
        alias: 'dataset',
        eager: true,
      },
      creator: {
        alias: 'creator',
        eager: true,
      },
      segments: {
        alias: 'segments',
        eager: false,
      },
    },
  },
  dto: {
    create: CreateDocumentDto,
    update: UpdateDocumentDto,
  },
  routes: {
    exclude: ['createManyBase'],
    ...CrudPermissions(Resource.DATASET),
  },
})
@Controller('documents')
@UseGuards(JwtAuthGuard)
@UseInterceptors(PopulateUserIdInterceptor)
@UsePipes(
  new ValidationPipe({
    transform: true,
    validatorPackage: { validate },
    transformerPackage: { plainToInstance, classToPlain },
  }),
)
export class DocumentController implements CrudController<Document> {
  private readonly logger = new Logger(DocumentController.name);

  constructor(
    public readonly service: DocumentService,
    private readonly documentProcessingService: DocumentProcessingService,
  ) {}

  @Override('deleteOneBase')
  async deleteOne(@ParsedRequest() req: CrudRequest) {
    const id = req.parsed.paramsFilter.find((f) => f.field === 'id')?.value;
    if (!id) {
      throw new Error('Document ID is required');
    }

    this.logger.log(
      `🗑️ Starting document deletion process for document: ${id}`,
    );

    try {
      // Step 1: Cancel all processing jobs for this specific document FIRST
      this.logger.log(`🛑 Cancelling all processing jobs for document: ${id}`);
      await this.documentProcessingService.cancelAllProcessingJobs(id);
      this.logger.log(
        `✅ Successfully cancelled processing jobs for document: ${id}`,
      );

      // Step 2: Delete the document and all related data
      this.logger.log(`🗑️ Deleting document and related data: ${id}`);
      await this.service.deleteDocument(id);
      this.logger.log(`✅ Successfully deleted document: ${id}`);

      // Step 3: Stop ALL ongoing processing jobs asynchronously (cleanup any remaining jobs)
      this.documentProcessingService
        .stopAllProcessingJobs(
          'File deleted by user - clearing all processing jobs',
        )
        .catch((error) => {
          this.logger.error('Failed to stop remaining processing jobs:', error);
        });

      this.logger.log(`✅ Document deletion completed successfully: ${id}`);
      return { deleted: true };
    } catch (error) {
      this.logger.error(`❌ Failed to delete document ${id}:`, error);
      throw error;
    }
  }

  @Post('upload')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: './uploads/documents',
        filename: (req, file, cb) => {
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        // Allow common document types
        const allowedMimes = [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain',
          'text/markdown',
          'application/json',
          'text/csv',
        ];

        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new Error(
              'Invalid file type. Only PDF, Word, Text, Markdown, JSON, and CSV files are allowed.',
            ),
            false,
          );
        }
      },
      limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE || '100') * 1024 * 1024,
      },
    }),
  )
  async uploadDocuments(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() uploadData: UploadDocumentDto,
    @Request() req: any,
  ) {
    if (!files || files.length === 0) {
      throw new Error('No files uploaded');
    }

    const userId = req.user?.id || req.user?.sub; // Extract user ID from JWT token

    if (!userId) {
      throw new Error('User not authenticated');
    }

    const result = await this.service.uploadDocuments(
      files,
      uploadData,
      userId,
    );

    return {
      success: true,
      message: `Successfully uploaded ${files.length} document(s)`,
      data: {
        dataset: result.dataset,
        documents: result.documents,
        uploadedFiles: files.map((file) => ({
          originalName: file.originalname,
          filename: file.filename,
          size: file.size,
          mimetype: file.mimetype,
        })),
      },
    };
  }

  @Post(':id/resume')
  async resumeDocumentProcessing(
    @Param('id') documentId: string,
    @Request() req: any,
  ) {
    const userId = req.user?.id || req.user?.sub;

    if (!userId) {
      throw new Error('User not authenticated');
    }

    try {
      const result =
        await this.documentProcessingService.resumeDocumentProcessing(
          documentId,
          userId,
        );

      return {
        success: true,
        message: result.message,
        data: {
          documentId: result.documentId,
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to resume document processing: ${error.message}`,
      );
      throw new BadRequestException(error.message);
    }
  }

  @Post(':id/pause')
  async pauseDocumentProcessing(
    @Param('id') documentId: string,
    @Request() req: any,
  ) {
    const userId = req.user?.id || req.user?.sub;

    if (!userId) {
      throw new Error('User not authenticated');
    }

    try {
      const result =
        await this.documentProcessingService.pauseDocumentProcessing(
          documentId,
        );

      return {
        success: true,
        message: result.message,
        data: {
          documentId: documentId,
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to pause document processing: ${error.message}`,
      );
      throw new BadRequestException(error.message);
    }
  }

  @Post(':id/retry')
  async retryDocumentProcessing(
    @Param('id') documentId: string,
    @Request() req: any,
  ) {
    const userId = req.user?.id || req.user?.sub;

    if (!userId) {
      throw new Error('User not authenticated');
    }

    try {
      const result =
        await this.documentProcessingService.retryDocumentProcessing(
          documentId,
        );

      return {
        success: true,
        message: result.message,
        data: {
          documentId: documentId,
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to retry document processing: ${error.message}`,
      );
      throw new BadRequestException(error.message);
    }
  }

  @Post(':id/cancel')
  async cancelDocumentProcessing(
    @Param('id') documentId: string,
    @Request() req: any,
  ) {
    const userId = req.user?.id || req.user?.sub;

    if (!userId) {
      throw new Error('User not authenticated');
    }

    try {
      const result =
        await this.documentProcessingService.cancelAllProcessingJobs(
          documentId,
        );

      return {
        success: true,
        message: result.message,
        data: {
          documentId: documentId,
          cancelledCount: result.cancelledCount,
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to cancel document processing: ${error.message}`,
      );
      throw new BadRequestException(error.message);
    }
  }

  @Get(':id/job-status')
  async getJobStatus(@Param('id') documentId: string, @Request() req: any) {
    const userId = req.user?.id || req.user?.sub;

    if (!userId) {
      throw new Error('User not authenticated');
    }

    try {
      const result =
        await this.documentProcessingService.getDocumentJobStatus(documentId);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error(`Failed to get job status: ${error.message}`);
      throw new BadRequestException(error.message);
    }
  }
}
