import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeOrmCrudService } from '@dataui/crud-typeorm';
import { Permission } from '../entities/permission.entity';

@Injectable()
export class PermissionService extends TypeOrmCrudService<Permission> {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
  ) {
    super(permissionRepository);
  }
}
