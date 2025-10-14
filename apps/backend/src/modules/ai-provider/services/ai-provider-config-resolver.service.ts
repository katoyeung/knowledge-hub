import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AiProviderService } from './ai-provider.service';
import { DatasetService } from '../../dataset/dataset.service';
import { UserService } from '../../user/user.service';
import { AiProvider } from '../entities/ai-provider.entity';
import { getProviderConfig } from '../provider-type.registry';

export interface ResolvedAiConfig {
  provider: AiProvider;
  model: string;
  temperature: number;
  maxChunks: number;
  promptId?: string;
  includeConversationHistory: boolean;
  conversationHistoryLimit: number;
  // 🆕 Search Weight Configuration
  bm25Weight?: number;
  embeddingWeight?: number;
}

@Injectable()
export class AiProviderConfigResolver {
  private readonly logger = new Logger(AiProviderConfigResolver.name);

  constructor(
    private readonly aiProviderService: AiProviderService,
    private readonly datasetService: DatasetService,
    private readonly userService: UserService,
  ) {}

  /**
   * Resolve AI configuration for a dataset with cascading fallback:
   * 1. Dataset chat_settings
   * 2. User chat_settings
   * 3. System defaults
   */
  async resolveForDataset(
    datasetId: string,
    userId: string,
  ): Promise<ResolvedAiConfig> {
    // 1. Try dataset settings first (dataset settings should override user settings)
    const dataset = await this.datasetService.findById(datasetId);
    if (!dataset) {
      throw new NotFoundException('Dataset not found');
    }

    const datasetConfig = this.extractDatasetChatSettings(dataset);
    if (datasetConfig && this.hasValidSettings(datasetConfig)) {
      return await this.buildConfigFromSettings(datasetConfig, userId);
    }

    // 2. Fall back to user settings
    try {
      const userSettings = await this.userService.getUserSettings(userId);
      const userChatSettings = (userSettings as any)?.chat_settings;

      if (userChatSettings && this.hasValidSettings(userChatSettings)) {
        return await this.buildConfigFromSettings(userChatSettings, userId);
      }
    } catch (error) {
      this.logger.warn(`Failed to load user settings: ${error.message}`);
    }

    // 3. Fall back to system defaults
    return await this.getSystemDefaults(userId);
  }

  /**
   * Resolve AI configuration for a user with fallback to system defaults
   */
  async resolveForUser(userId: string): Promise<ResolvedAiConfig> {
    try {
      const userSettings = await this.userService.getUserSettings(userId);
      const userChatSettings = (userSettings as any)?.chat_settings;

      if (userChatSettings && this.hasValidSettings(userChatSettings)) {
        return await this.buildConfigFromSettings(userChatSettings, userId);
      }
    } catch (error) {
      this.logger.warn(`Failed to load user settings: ${error.message}`);
    }

    // 3. Fall back to system defaults
    return await this.getSystemDefaults(userId);
  }

  /**
   * Get system default configuration
   */
  async getSystemDefaults(userId: string): Promise<ResolvedAiConfig> {
    // Look up the actual OpenRouter provider ID
    const openrouterProvider =
      await this.aiProviderService.findAiProviderByType('openrouter', userId);

    if (!openrouterProvider) {
      throw new Error(
        'OpenRouter AI provider not found. Please configure an AI provider.',
      );
    }

    return {
      provider: openrouterProvider,
      model: 'openai/gpt-oss-20b:free',
      temperature: 0.7,
      maxChunks: 5,
      includeConversationHistory: true,
      conversationHistoryLimit: 10,
    };
  }

  /**
   * Extract chat settings from dataset
   */
  private extractDatasetChatSettings(dataset: any): any | null {
    if (!dataset.settings || !(dataset.settings as any).chat_settings) {
      return null;
    }

    const chatSettings = (dataset.settings as any).chat_settings;

    // Check if chat settings are effectively null/empty
    const hasValidSettings = this.hasValidSettings(chatSettings);

    return hasValidSettings ? chatSettings : null;
  }

  /**
   * Check if settings object has valid (non-empty) values
   */
  private hasValidSettings(settings: any): boolean {
    return (
      (settings.provider !== null &&
        settings.provider !== undefined &&
        settings.provider !== '') ||
      (settings.model !== null &&
        settings.model !== undefined &&
        settings.model !== '') ||
      (settings.temperature !== null && settings.temperature !== undefined) ||
      (settings.maxChunks !== null && settings.maxChunks !== undefined) ||
      (settings.includeConversationHistory !== null &&
        settings.includeConversationHistory !== undefined) ||
      (settings.conversationHistoryLimit !== null &&
        settings.conversationHistoryLimit !== undefined)
    );
  }

  /**
   * Build configuration from settings object
   */
  private async buildConfigFromSettings(
    settings: any,
    userId: string,
  ): Promise<ResolvedAiConfig> {
    let provider: AiProvider | null = null;

    // Resolve provider
    if (settings.provider) {
      provider = await this.resolveProvider(settings.provider, userId);
    }

    if (!provider) {
      this.logger.error(`Provider not found: ${settings.provider}`);
      throw new Error(
        `AI provider '${settings.provider}' not found. Please configure an AI provider.`,
      );
    }

    // Get default model from provider config if not specified
    const providerConfig = getProviderConfig(provider.type);
    const defaultModel = providerConfig?.defaultModel || 'gpt-4';

    const config = {
      provider,
      model: settings.model || defaultModel,
      temperature:
        settings.temperature !== undefined ? settings.temperature : 0.7,
      maxChunks: settings.maxChunks !== undefined ? settings.maxChunks : 5,
      promptId: settings.promptId,
      includeConversationHistory: settings.includeConversationHistory !== false,
      conversationHistoryLimit:
        settings.conversationHistoryLimit !== undefined
          ? settings.conversationHistoryLimit
          : 10,
      // 🆕 Search Weight Configuration
      bm25Weight: settings.bm25Weight,
      embeddingWeight: settings.embeddingWeight,
    };

    return config;
  }

  /**
   * Resolve provider by ID or type
   */
  private async resolveProvider(
    providerId: string,
    userId: string,
  ): Promise<AiProvider | null> {
    try {
      // Check if it's a UUID (AI provider ID) or a provider type
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          providerId,
        );

      if (isUUID) {
        // Look up by ID
        return await this.aiProviderService.findAiProviderById(providerId);
      } else {
        // Look up by type
        return await this.aiProviderService.findAiProviderByType(
          providerId,
          userId,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to lookup AI provider ${providerId}: ${error.message}`,
      );
      return null;
    }
  }
}
