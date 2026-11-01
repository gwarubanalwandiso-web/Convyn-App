import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
@Catch(Prisma.PrismaClientKnownRequestError)
export class DatabaseErrorFilter implements ExceptionFilter {
  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const status = ['P2002', 'P2034'].includes(error.code)
      ? 409
      : error.code === 'P2025'
        ? 404
        : error.code === 'P2003'
          ? 400
          : 500;
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({
        statusCode: status,
        message:
          status === 409
            ? 'Conflicting or duplicate operation'
            : status === 404
              ? 'Record not found'
              : status === 400
                ? 'Invalid related record'
                : 'Database operation failed',
      });
  }
}
