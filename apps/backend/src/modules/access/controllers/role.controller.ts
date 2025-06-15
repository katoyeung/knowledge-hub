import {
  Controller,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Crud, CrudController } from '@dataui/crud';
import { Role } from '../entities/role.entity';
import { validate } from 'class-validator';
import { plainToInstance, classToPlain } from 'class-transformer';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RoleService } from '../services/role.service';
import { CreateRoleDto } from '../dto/create-role.dto';
import { CrudPermissions } from '../decorators/crud-permissions.decorator';
import { Resource } from '../enums/permission.enum';
import { PermsGuard } from '../guards/permissions.guard';

@Crud({
  model: {
    type: Role,
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
    join: {
      permissions: {
        eager: true,
      },
    },
  },
  routes: {
    exclude: ['createManyBase'],
    ...CrudPermissions(Resource.ROLE),
  },
  dto: {
    create: CreateRoleDto,
    update: CreateRoleDto,
    replace: CreateRoleDto,
  },
})
@Controller('roles')
@UseGuards(JwtAuthGuard, PermsGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    validatorPackage: { validate },
    transformerPackage: { plainToInstance, classToPlain },
  }),
)
export class RoleController implements CrudController<Role> {
  constructor(public readonly service: RoleService) {}
}
