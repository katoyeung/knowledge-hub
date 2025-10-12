import { DataSource } from 'typeorm';
import { Permission } from '../../modules/access/entities/permission.entity';
import { Action, Resource } from '../../modules/access/enums/permission.enum';

export class InitialPermissionsSeed {
  public async run(dataSource: DataSource): Promise<void> {
    const permissionRepository = dataSource.getRepository(Permission);
    await permissionRepository.query('TRUNCATE TABLE permissions CASCADE');

    // Define all possible permission combinations
    const permissions = [
      // User permissions
      { name: 'user:create', resource: Resource.USER, action: Action.CREATE },
      { name: 'user:read', resource: Resource.USER, action: Action.READ },
      { name: 'user:update', resource: Resource.USER, action: Action.UPDATE },
      { name: 'user:delete', resource: Resource.USER, action: Action.DELETE },

      // Role permissions
      { name: 'role:create', resource: Resource.ROLE, action: Action.CREATE },
      { name: 'role:read', resource: Resource.ROLE, action: Action.READ },
      { name: 'role:update', resource: Resource.ROLE, action: Action.UPDATE },
      { name: 'role:delete', resource: Resource.ROLE, action: Action.DELETE },

      // Permission permissions
      {
        name: 'permission:create',
        resource: Resource.PERMISSION,
        action: Action.CREATE,
      },
      {
        name: 'permission:read',
        resource: Resource.PERMISSION,
        action: Action.READ,
      },
      {
        name: 'permission:update',
        resource: Resource.PERMISSION,
        action: Action.UPDATE,
      },
      {
        name: 'permission:delete',
        resource: Resource.PERMISSION,
        action: Action.DELETE,
      },

      // Screener permissions
      {
        name: 'screener:create',
        resource: Resource.SCREENER,
        action: Action.CREATE,
      },
      {
        name: 'screener:read',
        resource: Resource.SCREENER,
        action: Action.READ,
      },
      {
        name: 'screener:update',
        resource: Resource.SCREENER,
        action: Action.UPDATE,
      },
      {
        name: 'screener:delete',
        resource: Resource.SCREENER,
        action: Action.DELETE,
      },

      // Instrument permissions
      {
        name: 'instrument:create',
        resource: Resource.INSTRUMENT,
        action: Action.CREATE,
      },
      {
        name: 'instrument:read',
        resource: Resource.INSTRUMENT,
        action: Action.READ,
      },
      {
        name: 'instrument:update',
        resource: Resource.INSTRUMENT,
        action: Action.UPDATE,
      },
      {
        name: 'instrument:delete',
        resource: Resource.INSTRUMENT,
        action: Action.DELETE,
      },

      // Indicator permissions
      {
        name: 'indicator:create',
        resource: Resource.INDICATOR,
        action: Action.CREATE,
      },
      {
        name: 'indicator:read',
        resource: Resource.INDICATOR,
        action: Action.READ,
      },
      {
        name: 'indicator:update',
        resource: Resource.INDICATOR,
        action: Action.UPDATE,
      },
      {
        name: 'indicator:delete',
        resource: Resource.INDICATOR,
        action: Action.DELETE,
      },

      // Dataset permissions
      {
        name: 'dataset:create',
        resource: Resource.DATASET,
        action: Action.CREATE,
      },
      {
        name: 'dataset:read',
        resource: Resource.DATASET,
        action: Action.READ,
      },
      {
        name: 'dataset:update',
        resource: Resource.DATASET,
        action: Action.UPDATE,
      },
      {
        name: 'dataset:delete',
        resource: Resource.DATASET,
        action: Action.DELETE,
      },

      // AI Provider permissions
      {
        name: 'ai-provider:create',
        resource: Resource.AI_PROVIDER,
        action: Action.CREATE,
      },
      {
        name: 'ai-provider:read',
        resource: Resource.AI_PROVIDER,
        action: Action.READ,
      },
      {
        name: 'ai-provider:update',
        resource: Resource.AI_PROVIDER,
        action: Action.UPDATE,
      },
      {
        name: 'ai-provider:delete',
        resource: Resource.AI_PROVIDER,
        action: Action.DELETE,
      },
    ];

    // Create permissions
    for (const permission of permissions) {
      const existingPermission = await permissionRepository.findOne({
        where: { name: permission.name },
      });

      if (!existingPermission) {
        await permissionRepository.save(permission);
      }
    }
  }
}
