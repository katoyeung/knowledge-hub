import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { TypeOrmCrudService } from '@dataui/crud-typeorm';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Role } from '@modules/access/entities/role.entity';
import { Cacheable } from '../../common/decorators/cacheable.decorator';

@Injectable()
export class UserService extends TypeOrmCrudService<User> {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {
    super(userRepository);
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async create(data: Partial<User>): Promise<User> {
    const user = this.userRepository.create(data);
    return this.userRepository.save(user);
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    await this.userRepository.update(id, data);
    const user = await this.findById(id);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  async invalidateUserCache(userId: string): Promise<void> {
    await this.cacheManager.del(`user:${userId}`);
    await this.cacheManager.del(`user:${userId}:settings`);
    await this.cacheManager.del('users:all');
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const user = await this.userRepository.save({ id, ...data });
    await this.invalidateUserCache(id);
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    await this.userRepository.delete(id);
    await this.invalidateUserCache(id);
  }

  @Cacheable({
    keyPrefix: 'user',
    keyGenerator: (userId: string) => `${userId}:settings`,
    ttl: 3600000, // 1 hour
  })
  async getUserSettings(userId: string): Promise<object> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'settings'],
    });

    if (!user) {
      throw new Error('User not found');
    }

    return user.settings || {};
  }

  async updateUserSettings(userId: string, settings: object): Promise<object> {
    // Deep merge with existing settings
    const existingUser = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'settings'],
    });

    if (!existingUser) {
      throw new Error('User not found');
    }

    const existingSettings = existingUser.settings || {};
    const mergedSettings = { ...existingSettings, ...settings };

    await this.userRepository.update(userId, { settings: mergedSettings });
    await this.invalidateUserCache(userId);

    return mergedSettings;
  }

  async createUser(
    name: string,
    email: string,
    password: string,
    roles?: Role[],
  ): Promise<User> {
    const user = this.userRepository.create({
      name,
      email,
      password,
      roles: roles || [],
    });
    return this.userRepository.save(user);
  }
}
