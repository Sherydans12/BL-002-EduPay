import { ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
  };
  const service = new HealthService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports the service and database as healthy', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const result = await service.getHealth();

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: 'ok',
      info: { database: { status: 'up' } },
      timestamp: expect.any(String),
    });
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });

  it('returns a 503 when the database check fails', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('Database unavailable'));

    await expect(service.getHealth()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
