import {
  Controller,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { UserService } from './user.service';
import { Crud, CrudController } from '@dataui/crud';
import { User } from './user.entity';
import { validate } from 'class-validator';
import { plainToInstance, classToPlain } from 'class-transformer';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { PermsGuard } from '@modules/access/guards/permissions.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Resource } from '@modules/access/enums/permission.enum';
import { CrudPermissions } from '@modules/access/decorators/crud-permissions.decorator';
@Crud({
  model: {
    type: User,
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
      roles: {
        alias: 'roles',
        eager: true,
      },
    },
  },
  dto: {
    create: CreateUserDto,
    update: UpdateUserDto,
  },
  routes: {
    exclude: ['createManyBase'],
    ...CrudPermissions(Resource.USER),
  },
})
@Controller('users')
@UseGuards(JwtAuthGuard, PermsGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    validatorPackage: { validate },
    transformerPackage: { plainToInstance, classToPlain },
  }),
)
export class UserController implements CrudController<User> {
  constructor(public readonly service: UserService) {}
}
