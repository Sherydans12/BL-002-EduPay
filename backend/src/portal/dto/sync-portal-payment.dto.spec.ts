import { PaymentMethod } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SyncPortalPaymentDto } from './sync-portal-payment.dto';

describe('SyncPortalPaymentDto', () => {
  const validPayload = {
    buyOrder: 'OC-123',
    amount: 120000,
    paymentMethod: PaymentMethod.WEBPAY,
    authorizationCode: '1213',
    cardNumber: '6623',
    chargeIds: [10, 11],
  };

  it('acepta el contrato Webpay del portal', async () => {
    const dto = plainToInstance(SyncPortalPaymentDto, validPayload);

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rechaza métodos distintos de WEBPAY y tarjetas que no sean últimos 4', async () => {
    const dto = plainToInstance(SyncPortalPaymentDto, {
      ...validPayload,
      paymentMethod: PaymentMethod.TRANSFER,
      cardNumber: '123456',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['paymentMethod', 'cardNumber']),
    );
  });
});
