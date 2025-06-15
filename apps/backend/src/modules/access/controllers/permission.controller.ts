import {
  Controller,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Crud, CrudController } from '@dataui/crud';
import { Permission } from '../entities/permission.entity';
import { validate } from 'class-validator';
import { plainToInstance, classToPlain } from 'class-transformer';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { PermissionService } from '../services/permission.service';
import { CreatePermissionDto } from '../dto/create-permission.dto';
import { CrudPermissions } from '../decorators/crud-permissions.decorator';
import { Resource } from '../enums/permission.enum';
import { PermsGuard } from '../guards/permissions.guard';
@Crud({
  model: {
    type: Permission,
  },
  params: {
    id: {
      field: 'id',
      type: 'number',
      primary: true,
    },
  },
  query: {
    sort: [
      {
        field: 'id',
        order: 'DESC',
      },
    ],
  },
  routes: {
    exclude: ['createManyBase'],
    ...CrudPermissions(Resource.PERMISSION),
  },
  dto: {
    create: CreatePermissionDto,
    update: CreatePermissionDto,
    replace: CreatePermissionDto,
  },
})
@Controller('permissions')
@UseGuards(JwtAuthGuard, PermsGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    validatorPackage: { validate },
    transformerPackage: { plainToInstance, classToPlain },
  }),
)
export class PermissionController implements CrudController<Permission> {
  constructor(public readonly service: PermissionService) {}
}
