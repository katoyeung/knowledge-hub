import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class CustomValidationPipe implements PipeTransform<any> {
  async transform(value: any, { metatype }: ArgumentMetadata) {
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }

    const object = plainToInstance(metatype, value);
    const errors = await validate(object);

    if (errors.length > 0) {
      const formattedErrors = errors.map((error) => {
        const constraints = error.constraints || {};
        const messages = Object.values(constraints);

        // Log each error's details
        console.log('Error details:', {
          property: error.property,
          constraints: error.constraints,
          value: error.value,
          children: error.children,
        });

        // Get the first error message for each field
        const message = messages[0];

        return {
          field: error.property,
          message: message,
          value: error.value,
        };
      });

      throw new BadRequestException({
        statusCode: 400,
        message: 'Validation failed',
        errors: formattedErrors,
      });
    }

    return object;
  }

  private toValidate(metatype: Function): boolean {
    const types: Function[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }
}
