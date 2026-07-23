import { ArgumentMetadata, BadRequestException, Logger } from '@nestjs/common';
import { SyncPortalPaymentDto } from '../../portal/dto/sync-portal-payment.dto';
import { LoggedValidationPipe } from './logged-validation.pipe';

describe('LoggedValidationPipe', () => {
  it('registra ValidationError por campo y conserva BadRequestException', async () => {
    const loggerWarn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const pipe = new LoggedValidationPipe();
    const metadata: ArgumentMetadata = {
      type: 'body',
      metatype: SyncPortalPaymentDto,
    };

    await expect(
      pipe.transform(
        {
          buyOrder: '',
          amount: 'invalid',
          paymentMethod: 'transfer',
          chargeIds: ['invalid'],
        },
        metadata,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(loggerWarn).toHaveBeenCalledWith({
      event: 'DTO_VALIDATION_FAILED',
      errors: expect.arrayContaining([
        expect.objectContaining({ property: 'buyOrder' }),
        expect.objectContaining({ property: 'amount' }),
        expect.objectContaining({ property: 'paymentMethod' }),
        expect.objectContaining({ property: 'chargeIds' }),
      ]),
    });
    loggerWarn.mockRestore();
  });
});
