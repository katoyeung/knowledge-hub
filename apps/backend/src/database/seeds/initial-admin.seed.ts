// src/database/seeds/initial-admin.seed.ts
import { DataSource } from 'typeorm';
import { User } from '../../modules/user/user.entity';
import { Role } from '../../modules/access/entities/role.entity';
import * as bcrypt from 'bcrypt';

export class InitialAdminSeed {
  public async run(dataSource: DataSource): Promise<void> {
    const userRepository = dataSource.getRepository(User);
    const roleRepository = dataSource.getRepository(Role);

    // Get admin role
    const adminRole = await roleRepository.findOne({
      where: { name: 'admin' },
    });

    if (!adminRole) {
      throw new Error('Admin role not found. Please run role seeder first.');
    }

    // Check if admin user already exists
    const existingAdmin = await userRepository.findOne({
      where: { email: 'admin@example.com' },
    });

    if (!existingAdmin) {
      // Create admin user
      const hashedPassword = await bcrypt.hash('PassW0rd@2025', 10);
      await userRepository.save({
        name: 'Super Admin',
        email: 'admin@example.com',
        password: hashedPassword,
        roles: [adminRole],
      });
      console.log('✅ Admin user created successfully');
    } else {
      // Update existing admin user's role
      existingAdmin.roles = [adminRole];
      await userRepository.save(existingAdmin);
      console.log('✅ Admin user role updated successfully');
    }
  }
}
