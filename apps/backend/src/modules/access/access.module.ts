import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { User } from '../user/user.entity';
import { RoleController } from './controllers/role.controller';
import { PermissionController } from './controllers/permission.controller';
import { RoleService } from './services/role.service';
import { PermissionService } from './services/permission.service';

@Module({
  imports: [TypeOrmModule.forFeature([Role, Permission, User])],
  controllers: [RoleController, PermissionController],
  providers: [RoleService, PermissionService],
  exports: [RoleService, PermissionService],
})
export class AccessModule {}
