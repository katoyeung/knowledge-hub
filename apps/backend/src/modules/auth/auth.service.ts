import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserService } from '@modules/user/user.service';
import { RoleService } from '@modules/access/services/role.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { User } from '@modules/user/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly roleService: RoleService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(email: string, password: string): Promise<User> {
    const name = email.split('@')[0];
    const hashedPassword = await bcrypt.hash(password, 10);

    // Get the user role
    const userRole = await this.roleService.findOne({
      where: { name: 'user' },
    });

    if (!userRole) {
      throw new Error('User role not found. Please run role seeder first.');
    }

    // Create user with the user role
    const user = await this.userService.createUser(
      name,
      email,
      hashedPassword,
      [userRole],
    );

    if (!user) {
      throw new Error('Failed to create user');
    }

    return user;
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.userService.findByEmail(email);
    if (user && (await bcrypt.compare(password, user.password))) {
      return user;
    }
    return null;
  }

  async login(user: User) {
    // Invalidate user cache using UserService
    await this.userService.invalidateUserCache(user.id);

    const payload = { email: user.email, sub: user.id };
    const expiresIn = this.configService.get<number>(
      'JWT_EXPIRES_IN',
      30 * 24 * 60 * 60,
    );

    return {
      access_token: this.jwtService.sign(payload, {
        expiresIn: `${expiresIn}s`,
      }),
      token_type: 'Bearer',
      expires_in: expiresIn,
      user,
    };
  }

  async logout(user: User) {
    await this.userService.invalidateUserCache(user.id);
  }
}
