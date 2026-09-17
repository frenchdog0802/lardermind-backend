import { HttpException, HttpStatus } from '@nestjs/common';

export class BadRequestError extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.BAD_REQUEST);
  }
}

export class NotFoundError extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.NOT_FOUND);
  }
}

export class UnauthorizedError extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.UNAUTHORIZED);
  }
}

export class QuotaExceededError extends HttpException {
  readonly quotaKey: string;

  constructor(quotaKey: string, message: string) {
    super({ message, quotaKey }, HttpStatus.PAYMENT_REQUIRED);
    this.quotaKey = quotaKey;
  }
}

export class ServiceUnavailableError extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
