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
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { DocumentService } from './document.service';
import { Crud, CrudController } from '@dataui/crud';
import { Document } from './entities/document.entity';
import { validate } from 'class-validator';
import { plainToInstance, classToPlain } from 'class-transformer';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { Resource } from '@modules/access/enums/permission.enum';
import { CrudPermissions } from '@modules/access/decorators/crud-permissions.decorator';
import { diskStorage } from 'multer';
import { extname } from 'path';
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
        field: 'position',
        order: 'ASC',
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
  constructor(public readonly service: DocumentService) {}

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
        fileSize: 10 * 1024 * 1024, // 10MB limit per file
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
}
