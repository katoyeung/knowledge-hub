import { DataSource } from 'typeorm';
import { Role } from '../../modules/access/entities/role.entity';
import { Permission } from '../../modules/access/entities/permission.entity';

export class InitialRolesSeed {
  public async run(dataSource: DataSource): Promise<void> {
    const roleRepository = dataSource.getRepository(Role);
    const permissionRepository = dataSource.getRepository(Permission);

    // Get all permissions
    const allPermissions = await permissionRepository.find();

    // Check if admin role exists
    let adminRole = await roleRepository.findOne({
      where: { name: 'admin' },
    });

    if (!adminRole) {
      // Create admin role with all permissions
      adminRole = await roleRepository.save({
        name: 'admin',
        permissions: allPermissions,
      });
      console.log('✅ Admin role created');
    } else {
      // Update admin role permissions
      adminRole.permissions = allPermissions;
      await roleRepository.save(adminRole);
      console.log('✅ Admin role updated');
    }

    // Create or update user role with limited permissions
    const userPermissions = allPermissions.filter(
      (permission) =>
        // Allow users to read roles and permissions
        (permission.action === 'read' &&
          (permission.resource === 'role' ||
            permission.resource === 'permission')) ||
        // Allow users to CRUD screeners
        (permission.resource === 'screener' &&
          (permission.action === 'create' ||
            permission.action === 'read' ||
            permission.action === 'update' ||
            permission.action === 'delete')) ||
        // Allow users to CRUD instruments
        (permission.resource === 'instrument' &&
          (permission.action === 'create' ||
            permission.action === 'read' ||
            permission.action === 'update' ||
            permission.action === 'delete')) ||
        // Allow users to CRUD indicators
        (permission.resource === 'indicator' &&
          (permission.action === 'create' ||
            permission.action === 'read' ||
            permission.action === 'update' ||
            permission.action === 'delete')),
    );

    // Check if user role exists
    let userRole = await roleRepository.findOne({
      where: { name: 'user' },
    });

    if (!userRole) {
      // Create user role with limited permissions
      userRole = await roleRepository.save({
        name: 'user',
        permissions: userPermissions,
      });
      console.log('✅ User role created');
    } else {
      // Update user role permissions
      userRole.permissions = userPermissions;
      await roleRepository.save(userRole);
      console.log('✅ User role updated');
    }
  }
}
