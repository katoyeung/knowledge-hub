import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  ValidationPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatService } from './services/chat.service';
import { AiProviderService } from '../ai-provider/services/ai-provider.service';
import { ChatWithDocumentsDto } from './dto/chat-with-documents.dto';
import { ChatResponseDto } from './dto/chat-response.dto';
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
    return await this.chatService.chatWithDocuments(dto, req.user.id);
  }

  @Get('conversations')
  async getConversations(
    @Request() req: any,
    @Param('datasetId') datasetId?: string,
  ) {
    return await this.chatService.getConversations(req.user.id, datasetId);
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

  @Get('models')
  async getAvailableModels(): Promise<ModelSelectionResponseDto> {
    return await this.aiProviderService.getAvailableModels();
  }
}
