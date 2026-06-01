import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

jest.mock('./multer.config', () => ({ multerConfig: {} }));

describe('PaymentsController', () => {
  let controller: PaymentsController;
  const paymentsService = {
    create: jest.fn(),
    createBatch: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [{ provide: PaymentsService, useValue: paymentsService }],
    }).compile();

    controller = module.get(PaymentsController);
  });

  it('createBatch pasa boletaFileUrl desde el archivo subido', async () => {
    const dto = {
      totalAmount: 75000,
      method: 'CASH',
      paymentDate: '2026-06-01',
      allocations: [{ studentId: 1, conceptId: 1, amount: 75000 }],
    };
    const file = { filename: 'abc.pdf' } as Express.Multer.File;
    paymentsService.createBatch.mockResolvedValue({ id: 1 });

    await controller.createBatch(dto as never, file);

    expect(paymentsService.createBatch).toHaveBeenCalledWith(
      dto,
      '/uploads/abc.pdf',
    );
  });

  it('createBatch sin archivo no envía URL de boleta', async () => {
    const dto = {
      totalAmount: 75000,
      method: 'CASH',
      paymentDate: '2026-06-01',
      allocations: [{ studentId: 1, conceptId: 1, amount: 75000 }],
    };
    paymentsService.createBatch.mockResolvedValue({ id: 2 });

    await controller.createBatch(dto as never, undefined);

    expect(paymentsService.createBatch).toHaveBeenCalledWith(dto, undefined);
  });
});
