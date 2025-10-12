import {
  Controller,
  UseGuards,
  UseInterceptors,
  Get,
  Query,
} from '@nestjs/common';
import { Crud, CrudController } from '@dataui/crud';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Prompt } from '../entities/prompt.entity';
import { PromptService } from '../services/prompt.service';
import { CreatePromptDto } from '../dto/create-prompt.dto';
import { UpdatePromptDto } from '../dto/update-prompt.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CrudAuthFilter } from '@modules/access/decorators/crud-auth-filter.decorator';
import { PopulateUserIdInterceptor } from '@common/interceptors/populate-user-id.interceptor';

@Crud({
  model: {
    type: Prompt,
  },
  params: {
    id: {
      field: 'id',
      type: 'uuid',
      primary: true,
    },
  },
  query: {
    sort: [
      {
        field: 'createdAt',
        order: 'DESC',
      },
    ],
    join: {
      user: {
        alias: 'user',
        eager: true,
      },
    },
  },
  dto: {
    create: CreatePromptDto,
    update: UpdatePromptDto,
  },
  routes: {
    exclude: ['createManyBase'],
  },
})
@Controller('prompts')
@UseGuards(JwtAuthGuard)
@UseInterceptors(PopulateUserIdInterceptor)
@CrudAuthFilter('userId')
@ApiTags('Prompts')
export class PromptController implements CrudController<Prompt> {
  constructor(public readonly service: PromptService) {}

  @Get('search')
  @ApiOperation({ summary: 'Search prompts with pagination' })
  @ApiQuery({ name: 'q', required: false, description: 'Search query' })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number',
    type: Number,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items per page',
    type: Number,
  })
  @ApiQuery({ name: 'sort', required: false, description: 'Sort field' })
  async searchPrompts(
    @Query('q') searchQuery?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('sort') sort: string = 'createdAt,DESC',
  ) {
    return this.service.searchPrompts(searchQuery, page, limit, sort);
  }
}
