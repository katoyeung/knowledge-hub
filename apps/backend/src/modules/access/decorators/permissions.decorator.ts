import { SetMetadata } from '@nestjs/common';
import { Action, Resource } from '../enums/permission.enum';

export const PERMS_KEY = 'permissions';
export const Permissions = (
  ...perms: { action: Action; resource: Resource }[]
) => SetMetadata(PERMS_KEY, perms);
