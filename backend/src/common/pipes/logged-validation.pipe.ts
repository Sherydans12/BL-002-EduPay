import { Logger, ValidationError, ValidationPipe } from '@nestjs/common';

export class LoggedValidationPipe extends ValidationPipe {
  private readonly validationLogger = new Logger(ValidationPipe.name);

  constructor() {
    super({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    });

    const defaultExceptionFactory = this.createExceptionFactory();
    this.exceptionFactory = (errors: ValidationError[]) => {
      this.validationLogger.warn({
        event: 'DTO_VALIDATION_FAILED',
        errors: this.toLoggableErrors(errors),
      });
      return defaultExceptionFactory(errors);
    };
  }

  private toLoggableErrors(errors: ValidationError[]): ValidationError[] {
    return errors.map((error) => ({
      property: error.property,
      constraints: error.constraints,
      contexts: error.contexts,
      children: error.children
        ? this.toLoggableErrors(error.children)
        : undefined,
    }));
  }
}
