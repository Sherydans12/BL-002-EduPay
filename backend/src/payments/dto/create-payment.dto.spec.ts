import { PaymentMethod } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePaymentDto } from './create-payment.dto';

describe('CreatePaymentDto', () => {
  const validPayload = {
    amount: 75000,
    method: PaymentMethod.TRANSFER,
    paymentDate: '2026-07-23',
    studentId: 1,
  };

  it('usa envío por defecto cuando el flag se omite', async () => {
    const dto = plainToInstance(CreatePaymentDto, validPayload);

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.sendEmailNotification).toBeUndefined();
  });

  it('transforma false desde multipart para desactivar el envío', async () => {
    const dto = plainToInstance(CreatePaymentDto, {
      ...validPayload,
      sendEmailNotification: 'false',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.sendEmailNotification).toBe(false);
  });
});
