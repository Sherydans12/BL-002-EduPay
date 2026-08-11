import { ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { LoggedValidationPipe } from '../../common/pipes/logged-validation.pipe';
import { CreateStudentDto } from './create-student.dto';

describe('CreateStudentDto integration identity and structured names', () => {
  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: CreateStudentDto,
  };
  const valid = {
    rut: '12.345.678-5',
    firstName: 'María José',
    lastName: 'Pérez Soto',
    courseId: 1,
    guardianId: 1,
  };

  it('requires structured names for new ordinary CRUD records', async () => {
    const pipe = new LoggedValidationPipe();
    await expect(
      pipe.transform({ ...valid, firstName: undefined }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform({ ...valid, lastName: '   ' }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects application attempts to assign integrationId', async () => {
    const pipe = new LoggedValidationPipe();
    await expect(
      pipe.transform(
        {
          ...valid,
          integrationId: '00000000-0000-4000-8000-000000000001',
        },
        metadata,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
