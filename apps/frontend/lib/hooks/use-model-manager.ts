import { useState, useEffect, useCallback } from "react";
import { aiProviderApi, type AiProviderModel } from "@/lib/api";

interface UseModelManagerOptions {
  providerId: string;
  autoLoad?: boolean;
}

interface UseModelManagerReturn {
  models: AiProviderModel[];
  loading: boolean;
  error: string | null;
  addModel: (modelData: AiProviderModel) => Promise<void>;
  updateModel: (
    modelId: string,
    updates: Partial<AiProviderModel>
  ) => Promise<void>;
  removeModel: (modelId: string) => Promise<void>;
  getModel: (modelId: string) => Promise<AiProviderModel | null>;
  refreshModels: () => Promise<void>;
}

export function useModelManager({
  providerId,
  autoLoad = true,
}: UseModelManagerOptions): UseModelManagerReturn {
  const [models, setModels] = useState<AiProviderModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadModels = useCallback(async () => {
    if (!providerId) return;

    try {
      setLoading(true);
      setError(null);
      const modelsData = await aiProviderApi.getModels(providerId);
      setModels(modelsData);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load models";
      setError(errorMessage);
      console.error("Error loading models:", err);
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  const addModel = useCallback(
    async (modelData: AiProviderModel) => {
      try {
        setError(null);
        await aiProviderApi.addModel(providerId, modelData);
        await loadModels(); // Refresh the list
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to add model";
        setError(errorMessage);
        throw err;
      }
    },
    [providerId, loadModels]
  );

  const updateModel = useCallback(
    async (modelId: string, updates: Partial<AiProviderModel>) => {
      try {
        setError(null);
        await aiProviderApi.updateModel(providerId, modelId, updates);
        await loadModels(); // Refresh the list
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to update model";
        setError(errorMessage);
        throw err;
      }
    },
    [providerId, loadModels]
  );

  const removeModel = useCallback(
    async (modelId: string) => {
      try {
        setError(null);
        await aiProviderApi.removeModel(providerId, modelId);
        await loadModels(); // Refresh the list
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to remove model";
        setError(errorMessage);
        throw err;
      }
    },
    [providerId, loadModels]
  );

  const getModel = useCallback(
    async (modelId: string): Promise<AiProviderModel | null> => {
      try {
        setError(null);
        return await aiProviderApi.getModel(providerId, modelId);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to get model";
        setError(errorMessage);
        return null;
      }
    },
    [providerId]
  );

  const refreshModels = useCallback(async () => {
    await loadModels();
  }, [loadModels]);

  useEffect(() => {
    if (autoLoad && providerId) {
      loadModels();
    }
  }, [autoLoad, providerId, loadModels]);

  return {
    models,
    loading,
    error,
    addModel,
    updateModel,
    removeModel,
    getModel,
    refreshModels,
  };
}

// Utility hook for model validation
export function useModelValidation() {
  const validateModel = (model: Partial<AiProviderModel>): string[] => {
    const errors: string[] = [];

    if (!model.id?.trim()) {
      errors.push("Model ID is required");
    }

    if (!model.name?.trim()) {
      errors.push("Model name is required");
    }

    if (model.maxTokens && model.maxTokens <= 0) {
      errors.push("Max tokens must be greater than 0");
    }

    if (model.contextWindow && model.contextWindow <= 0) {
      errors.push("Context window must be greater than 0");
    }

    if (model.pricing) {
      if (model.pricing.input < 0) {
        errors.push("Input price cannot be negative");
      }
      if (model.pricing.output < 0) {
        errors.push("Output price cannot be negative");
      }
    }

    return errors;
  };

  const validateModelId = (
    id: string,
    existingModels: AiProviderModel[]
  ): string[] => {
    const errors: string[] = [];

    if (!id.trim()) {
      errors.push("Model ID is required");
    }

    if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
      errors.push(
        "Model ID can only contain letters, numbers, dots, underscores, and hyphens"
      );
    }

    if (existingModels.some((model) => model.id === id)) {
      errors.push("Model ID already exists");
    }

    return errors;
  };

  return {
    validateModel,
    validateModelId,
  };
}

// Hook for model statistics
export function useModelStats(models: AiProviderModel[]) {
  const stats = {
    total: models.length,
    withPricing: models.filter((m) => m.pricing).length,
    avgMaxTokens:
      models.reduce((sum, m) => sum + (m.maxTokens || 0), 0) / models.length ||
      0,
    avgContextWindow:
      models.reduce((sum, m) => sum + (m.contextWindow || 0), 0) /
        models.length || 0,
    totalInputCost: models.reduce((sum, m) => sum + (m.pricing?.input || 0), 0),
    totalOutputCost: models.reduce(
      (sum, m) => sum + (m.pricing?.output || 0),
      0
    ),
  };

  return stats;
}
