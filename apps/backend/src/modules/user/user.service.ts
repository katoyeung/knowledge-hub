import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { TypeOrmCrudService } from '@dataui/crud-typeorm';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Role } from '@modules/access/entities/role.entity';

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
