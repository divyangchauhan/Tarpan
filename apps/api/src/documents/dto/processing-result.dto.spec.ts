import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DocumentStatus } from '@tarpan/shared';
import { ProcessingResultDto } from './processing-result.dto';

describe('ProcessingResultDto', () => {
  const base = {
    documentId: '123e4567-e89b-12d3-a456-426614174000',
    status: DocumentStatus.PROCESSED,
  };

  it('accepts the processor’s supported extracted-data fields', async () => {
    const dto = plainToInstance(ProcessingResultDto, {
      ...base,
      extractedData: { first_name: 'Helen', date_of_death: '2024-09-15' },
    });

    await expect(validate(dto, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual(
      [],
    );
  });

  it('rejects unknown extracted-data fields', async () => {
    const dto = plainToInstance(ProcessingResultDto, {
      ...base,
      extractedData: { first_name: 'Helen', unexpectedField: 'not allowed' },
    });

    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    const extractedDataError = errors.find((error) => error.property === 'extractedData');
    expect(extractedDataError?.children?.[0]?.constraints).toBeDefined();
  });
});
