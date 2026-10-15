export class HttpException extends Error {
  readonly statusCode: number;
  readonly errors?: unknown;
  /** machine-readable reason the client can react to, e.g. PLAN_LIMIT_REACHED */
  code?: string;

  constructor(statusCode: number, message: string, errors?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
  }

  withCode(code: string): this {
    this.code = code;
    return this;
  }
}

export class BadRequestException extends HttpException {
  constructor(message = 'Bad request', errors?: unknown) {
    super(400, message, errors);
  }
}

export class UnauthorizedException extends HttpException {
  constructor(message = 'Unauthorized') {
    super(401, message);
  }
}

export class ForbiddenException extends HttpException {
  constructor(message = 'You do not have permission to perform this action') {
    super(403, message);
  }
}

export class NotFoundException extends HttpException {
  constructor(message = 'Not found') {
    super(404, message);
  }
}

export class ConflictException extends HttpException {
  constructor(message = 'Conflict') {
    super(409, message);
  }
}
