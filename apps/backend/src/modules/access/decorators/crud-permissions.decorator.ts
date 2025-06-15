import { Action, Resource } from '../enums/permission.enum';
import { Permissions } from './permissions.decorator';

export const CrudPermissions = (resource: Resource) => ({
  getManyBase: {
    decorators: [Permissions({ action: Action.READ, resource })],
  },
  getOneBase: {
    decorators: [Permissions({ action: Action.READ, resource })],
  },
  createOneBase: {
    decorators: [Permissions({ action: Action.CREATE, resource })],
  },
  createManyBase: {
    decorators: [Permissions({ action: Action.CREATE, resource })],
  },
  replaceOneBase: {
    decorators: [Permissions({ action: Action.UPDATE, resource })],
  },
  updateOneBase: {
    decorators: [Permissions({ action: Action.UPDATE, resource })],
  },
  deleteOneBase: {
    decorators: [Permissions({ action: Action.DELETE, resource })],
  },
});
