import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ name: 'isModelAwareChunkOverlap', async: false })
export class IsModelAwareChunkOverlapConstraint
  implements ValidatorConstraintInterface
{
  validate(value: any, args: ValidationArguments) {
    if (typeof value !== 'number') {
      return false;
    }

    const object = args.object as any;
    const embeddingModel = object.embeddingModel || object.model;
    const chunkSize = object.chunkSize;

    if (!embeddingModel || !chunkSize) {
      return value >= 0 && value <= 500; // Default validation
    }

    // Models that can handle larger overlap ratios
    const largeOverlapModels = [
      'qwen3-embedding:4b',
      'mixedbread-ai/mxbai-embed-large-v1',
    ];

    const maxOverlapRatio = largeOverlapModels.includes(embeddingModel)
      ? 0.15
      : 0.5;
    const maxOverlap = Math.floor(chunkSize * maxOverlapRatio);

    return value >= 0 && value <= maxOverlap;
  }

  defaultMessage(args: ValidationArguments) {
    const object = args.object as any;
    const embeddingModel = object.embeddingModel || object.model;
    const chunkSize = object.chunkSize;

    if (!embeddingModel || !chunkSize) {
      return 'Chunk overlap must be between 0 and 500 characters';
    }

    const largeOverlapModels = [
      'qwen3-embedding:4b',
      'mixedbread-ai/mxbai-embed-large-v1',
    ];

    const maxOverlapRatio = largeOverlapModels.includes(embeddingModel)
      ? 0.15
      : 0.5;
    const maxOverlap = Math.floor(chunkSize * maxOverlapRatio);

    return `Chunk overlap must be between 0 and ${maxOverlap} characters (${Math.round(maxOverlapRatio * 100)}% of chunk size) for this model`;
  }
}

export function IsModelAwareChunkOverlap(
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsModelAwareChunkOverlapConstraint,
    });
  };
}
