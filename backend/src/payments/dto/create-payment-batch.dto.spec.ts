import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreatePaymentBatchDto } from './create-payment-batch.dto';

function toDto(body: Record<string, unknown>): CreatePaymentBatchDto {
  return plainToInstance(CreatePaymentBatchDto, body, {
    enableImplicitConversion: true,
  });
}

async function validateDto(body: Record<string, unknown>) {
  return validate(toDto(body));
}

describe('CreatePaymentBatchDto (multipart / JSON)', () => {
  it('acepta allocations como JSON string con montos en string (multipart)', async () => {
    const errors = await validateDto({
      totalAmount: '75000',
      method: 'CASH',
      paymentDate: '2026-06-01',
      allocations: JSON.stringify([
        { studentId: '1', conceptId: '1', amount: '75000' },
      ]),
    });

    expect(errors).toHaveLength(0);
  });

  it('acepta cobro agrupado con dos alumnos vía multipart', async () => {
    const errors = await validateDto({
      totalAmount: '150000',
      method: 'TRANSFER',
      paymentDate: '2026-06-01',
      allocations: JSON.stringify([
        { studentId: '1', conceptId: '1', amount: '75000' },
        { studentId: '2', conceptId: '1', amount: '75000' },
      ]),
    });

    expect(errors).toHaveLength(0);
  });

  it('rechaza cuando la suma de allocations no coincide con totalAmount', async () => {
    const errors = await validateDto({
      totalAmount: '80000',
      method: 'CASH',
      paymentDate: '2026-06-01',
      allocations: JSON.stringify([
        { studentId: 1, conceptId: 1, amount: 75000 },
      ]),
    });

    expect(errors.length).toBeGreaterThan(0);
    const allocationError = errors.find((e) => e.property === 'allocations');
    expect(allocationError).toBeDefined();
  });

  it('rechaza allocations vacío', async () => {
    const errors = await validateDto({
      totalAmount: 1000,
      method: 'CASH',
      paymentDate: '2026-06-01',
      allocations: JSON.stringify([]),
    });

    expect(errors.length).toBeGreaterThan(0);
  });

  it('acepta body application/json sin stringify', async () => {
    const dto = toDto({
      totalAmount: 150000,
      method: 'DEBIT',
      paymentDate: '2026-06-01',
      allocations: [
        { studentId: 1, conceptId: 1, amount: 75000 },
        { studentId: 2, conceptId: 1, amount: 75000 },
      ],
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.allocations[0].amount).toBe(75000);
  });
});
