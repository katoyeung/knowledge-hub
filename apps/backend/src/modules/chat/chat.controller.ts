import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  Sse,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatService } from './services/chat.service';
import { AiProviderService } from '../ai-provider/services/ai-provider.service';
import { ChatWithDocumentsDto } from './dto/chat-with-documents.dto';
import {
  ChatResponseDto,
  PaginatedMessagesResponseDto,
  ConversationDto,
} from './dto/chat-response.dto';
import { ChatMessageDto } from './dto/chat-response.dto';
import { ModelSelectionResponseDto } from './dto/model-selection.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly aiProviderService: AiProviderService,
  ) {}

  @Post('with-documents')
  @HttpCode(HttpStatus.OK)
  async chatWithDocuments(
    @Body(ValidationPipe) dto: ChatWithDocumentsDto,
    @Request() req: any,
  ): Promise<ChatResponseDto> {
    // Use non-streaming (ignore stream parameter for backward compatibility)
    return await this.chatService.chatWithDocuments(dto, req.user.id);
  }

  @Post('with-documents/stream')
  @Sse()
  async chatWithDocumentsStream(
    @Body(ValidationPipe) dto: ChatWithDocumentsDto,
    @Request() req: any,
  ): Promise<Observable<MessageEvent>> {
    // Use streaming (ignore stream parameter for backward compatibility)
    return await this.chatService.chatWithDocumentsStream(dto, req.user.id);
  }

  @Get('conversations')
  async getConversations(
    @Request() req: any,
    @Param('datasetId') datasetId?: string,
  ) {
    // Returns ALL conversations for user/dataset regardless of AI model used
    return await this.chatService.getConversations(req.user.id, datasetId);
  }

  @Get('conversations/latest')
  async getLatestConversation(
    @Request() req: any,
    @Query('datasetId') datasetId: string,
  ): Promise<ConversationDto | null> {
    // Returns the most recently updated conversation regardless of AI model used
    return await this.chatService.getLatestConversation(datasetId, req.user.id);
  }

  @Get('conversations/:conversationId/messages')
  async getConversationMessages(
    @Param('conversationId') conversationId: string,
    @Request() req: any,
  ): Promise<ChatMessageDto[]> {
    return await this.chatService.getConversationMessages(
      conversationId,
      req.user.id,
    );
  }

  @Get('conversations/:conversationId/messages/paginated')
  async getConversationMessagesPaginated(
    @Param('conversationId') conversationId: string,
    @Request() req: any,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ): Promise<PaginatedMessagesResponseDto> {
    return await this.chatService.getConversationMessagesPaginated(
      conversationId,
      req.user.id,
      page,
      limit,
    );
  }

  @Get('models')
  async getAvailableModels(): Promise<ModelSelectionResponseDto> {
    return await this.aiProviderService.getAvailableModels();
  }
}
