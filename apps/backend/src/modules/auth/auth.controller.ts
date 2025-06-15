import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
  UseGuards,
  Request,
  ClassSerializerInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { User } from '@modules/user/user.entity';

@UseInterceptors(ClassSerializerInterceptor)
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(
    @Body('email') email: string,
    @Body('password') password: string,
  ): Promise<User> {
    try {
      return await this.authService.register(email, password);
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === '23505') {
        throw new HttpException('Email already exists', HttpStatus.CONFLICT);
      }
      throw new HttpException('Registration failed', HttpStatus.BAD_REQUEST);
    }
  }

  @UseGuards(LocalAuthGuard)
  @Post('login')
  login(@Request() req: { user: User }) {
    return this.authService.login(req.user);
  }
}
