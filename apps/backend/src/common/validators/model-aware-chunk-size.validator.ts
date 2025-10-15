import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ name: 'isModelAwareChunkSize', async: false })
export class IsModelAwareChunkSizeConstraint
  implements ValidatorConstraintInterface
{
  validate(value: any, args: ValidationArguments) {
    if (typeof value !== 'number') {
      return false;
    }

    const object = args.object as any;
    const embeddingModel = object.embeddingModel || object.model;

    if (!embeddingModel) {
      return value >= 100 && value <= 8000; // Default validation
    }

    // Models that can handle larger chunk sizes
    const largeChunkModels = [
      'qwen3-embedding:4b',
      'mixedbread-ai/mxbai-embed-large-v1',
    ];

    // Local models (BGE-M3) have stricter limits
    const localModels = [
      'Xenova/bge-m3',
      'mixedbread-ai/mxbai-embed-large-v1',
      'WhereIsAI/UAE-Large-V1',
    ];

    let maxChunkSize;
    if (localModels.includes(embeddingModel)) {
      maxChunkSize = 2000; // Conservative limit for local models
    } else if (largeChunkModels.includes(embeddingModel)) {
      maxChunkSize = 12000;
    } else {
      maxChunkSize = 8000;
    }

    return value >= 100 && value <= maxChunkSize;
  }

  defaultMessage(args: ValidationArguments) {
    const object = args.object as any;
    const embeddingModel = object.embeddingModel || object.model;

    if (!embeddingModel) {
      return 'Chunk size must be between 100 and 8000 characters';
    }

    const largeChunkModels = [
      'qwen3-embedding:4b',
      'mixedbread-ai/mxbai-embed-large-v1',
    ];

    // Local models (BGE-M3) have stricter limits
    const localModels = [
      'Xenova/bge-m3',
      'mixedbread-ai/mxbai-embed-large-v1',
      'WhereIsAI/UAE-Large-V1',
    ];

    let maxChunkSize;
    if (localModels.includes(embeddingModel)) {
      maxChunkSize = 2000; // Conservative limit for local models
    } else if (largeChunkModels.includes(embeddingModel)) {
      maxChunkSize = 12000;
    } else {
      maxChunkSize = 8000;
    }

    return `Chunk size must be between 100 and ${maxChunkSize} characters for this model`;
  }
}

export function IsModelAwareChunkSize(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsModelAwareChunkSizeConstraint,
    });
  };
}
