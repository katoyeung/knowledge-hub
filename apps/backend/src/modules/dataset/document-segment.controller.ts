import {
  Controller,
  UseGuards,
  UsePipes,
  ValidationPipe,
  Get,
  Param,
  Patch,
  Body,
  Post,
  Query,
} from '@nestjs/common';
import { DocumentSegmentService } from './document-segment.service';
import { Crud, CrudController, ParsedRequest, Override } from '@dataui/crud';
import { DocumentSegment } from './entities/document-segment.entity';
import { validate } from 'class-validator';
import { plainToInstance, classToPlain } from 'class-transformer';
import { JwtOrApiKeyAuthGuard } from '@modules/api-key/guards/jwt-or-api-key.guard';
import { CreateDocumentSegmentDto } from './dto/create-document-segment.dto';
import { UpdateDocumentSegmentDto } from './dto/update-document-segment.dto';
import { Resource } from '@modules/access/enums/permission.enum';
import { CrudPermissions } from '@modules/access/decorators/crud-permissions.decorator';
import {
  IsArray,
  IsString,
  IsBoolean,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

// DTO for pagination
class PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  limit?: number = 20;
}

// DTO for filtering segments by graph data
class SegmentFilterQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  hasGraphData?: 'true' | 'false' | 'all' = 'all';
}

// DTO for bulk operations
class BulkSegmentIdsDto {
  @IsArray()
  @IsString({ each: true })
  segmentIds: string[];
}

class BulkUpdateStatusDto extends BulkSegmentIdsDto {
  @IsBoolean()
  enabled: boolean;
}

@Crud({
  model: {
    type: DocumentSegment,
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
      document: {
        alias: 'document',
        eager: true,
      },
      dataset: {
        alias: 'dataset',
        eager: true,
      },
      user: {
        alias: 'user',
        eager: true,
      },
    },
  },
  dto: {
    create: CreateDocumentSegmentDto,
    update: UpdateDocumentSegmentDto,
  },
  routes: {
    exclude: ['createManyBase'],
    ...CrudPermissions(Resource.DATASET),
  },
})
@Controller('document-segments')
@UseGuards(JwtOrApiKeyAuthGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    validatorPackage: { validate },
    transformerPackage: { plainToInstance, classToPlain },
  }),
)
export class DocumentSegmentController
  implements CrudController<DocumentSegment>
{
  constructor(public readonly service: DocumentSegmentService) {}

  @Get('document/:documentId')
  async findByDocument(
    @Param('documentId') documentId: string,
    @Query() paginationQuery: PaginationQueryDto,
  ) {
    return await this.service.findByDocumentIdPaginated(
      documentId,
      paginationQuery.page || 1,
      paginationQuery.limit || 20,
    );
  }

  @Get('document/:documentId/filtered')
  async findByDocumentWithFilters(
    @Param('documentId') documentId: string,
    @Query() filterQuery: SegmentFilterQueryDto,
  ) {
    return await this.service.findByDocumentIdWithFilters(
      documentId,
      filterQuery.page || 1,
      filterQuery.limit || 20,
      filterQuery.search,
      filterQuery.hasGraphData,
    );
  }

  @Get('dataset/:datasetId')
  async findByDataset(@Param('datasetId') datasetId: string) {
    return await this.service.findByDatasetId(datasetId);
  }

  @Patch(':id/toggle-status')
  async toggleStatus(@Param('id') id: string) {
    return await this.service.toggleStatus(id);
  }

  @Override('updateOneBase')
  async updateOne(@ParsedRequest() req: any, @Body() dto: any) {
    const id = req.parsed.paramsFilter.find(
      (f: any) => f.field === 'id',
    )?.value;
    if (!id) {
      throw new Error('Segment ID is required');
    }

    return await this.service.updateSegmentWithEmbedding(id, dto);
  }

  @Post('bulk/delete')
  async bulkDelete(@Body() dto: BulkSegmentIdsDto) {
    return await this.service.bulkDelete(dto.segmentIds);
  }

  @Post('bulk/update-status')
  async bulkUpdateStatus(@Body() dto: BulkUpdateStatusDto) {
    return await this.service.bulkUpdateStatus(dto.segmentIds, dto.enabled);
  }

  @Get('document/:documentId/status-counts')
  async getDocumentSegmentStatusCounts(
    @Param('documentId') documentId: string,
  ) {
    return await this.service.getDocumentSegmentStatusCounts(documentId);
  }

  @Post('document/:documentId/fix-stuck-segments')
  async fixStuckSegments(@Param('documentId') documentId: string) {
    return await this.service.fixStuckSegments(documentId);
  }
}
