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
    guardianEmail: 'apoderado@example.com',
    chargeIds: [10, 11],
  };

  it('acepta el contrato Webpay del portal', async () => {
    const dto = plainToInstance(SyncPortalPaymentDto, validPayload);

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('normaliza tipos, WEBPAY_PLUS y los últimos cuatro dígitos', async () => {
    const dto = plainToInstance(SyncPortalPaymentDto, {
      ...validPayload,
      amount: '120000',
      paymentMethod: 'webpay_plus',
      authorizationCode: undefined,
      cardNumber: 123456,
      chargeIds: ['10', '11'],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      amount: 120000,
      paymentMethod: PaymentMethod.WEBPAY,
      cardNumber: '3456',
      guardianEmail: 'apoderado@example.com',
      chargeIds: [10, 11],
    });
  });

  it('acepta autorización y tarjeta ausentes', async () => {
    const dto = plainToInstance(SyncPortalPaymentDto, {
      ...validPayload,
      authorizationCode: null,
      cardNumber: null,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.cardNumber).toBeUndefined();
  });

  it('mantiene guardianEmail opcional para auditoría', async () => {
    const withoutEmail = plainToInstance(SyncPortalPaymentDto, {
      ...validPayload,
      guardianEmail: undefined,
    });
    const withTrimmedEmail = plainToInstance(SyncPortalPaymentDto, {
      ...validPayload,
      guardianEmail: '  auditoria@example.com  ',
    });

    await expect(validate(withoutEmail)).resolves.toHaveLength(0);
    await expect(validate(withTrimmedEmail)).resolves.toHaveLength(0);
    expect(withTrimmedEmail.guardianEmail).toBe('auditoria@example.com');
  });

  it('rechaza métodos distintos de WEBPAY e IDs no numéricos', async () => {
    const dto = plainToInstance(SyncPortalPaymentDto, {
      ...validPayload,
      paymentMethod: PaymentMethod.TRANSFER,
      cardNumber: 'abc',
      chargeIds: ['not-an-id'],
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['paymentMethod', 'cardNumber', 'chargeIds']),
    );
  });
});
