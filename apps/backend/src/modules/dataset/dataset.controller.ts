import {
  Controller,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { DatasetService } from './dataset.service';
import { Crud, CrudController } from '@dataui/crud';
import { Dataset } from './entities/dataset.entity';
import { validate } from 'class-validator';
import { plainToInstance, classToPlain } from 'class-transformer';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { PermsGuard } from '@modules/access/guards/permissions.guard';
import { CreateDatasetDto } from './dto/create-dataset.dto';
import { UpdateDatasetDto } from './dto/update-dataset.dto';
import { Resource } from '@modules/access/enums/permission.enum';
import { CrudPermissions } from '@modules/access/decorators/crud-permissions.decorator';
import { PopulateUserIdInterceptor } from '@common/interceptors/populate-user-id.interceptor';

@Crud({
  model: {
    type: Dataset,
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
      owner: {
        alias: 'owner',
        eager: true,
      },
      documents: {
        alias: 'documents',
        eager: false,
      },
      segments: {
        alias: 'segments',
        eager: false,
      },
      keywordTable: {
        alias: 'keywordTable',
        eager: false,
      },
    },
  },
  dto: {
    create: CreateDatasetDto,
    update: UpdateDatasetDto,
  },
  routes: {
    exclude: ['createManyBase'],
    ...CrudPermissions(Resource.DATASET),
  },
})
@Controller('datasets')
//@UseGuards(JwtAuthGuard, PermsGuard)
@UseGuards(JwtAuthGuard)
@UseInterceptors(PopulateUserIdInterceptor)
@UsePipes(
  new ValidationPipe({
    transform: true,
    validatorPackage: { validate },
    transformerPackage: { plainToInstance, classToPlain },
  }),
)
export class DatasetController implements CrudController<Dataset> {
  constructor(public readonly service: DatasetService) {}
}
