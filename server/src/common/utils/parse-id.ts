import { BadRequestException } from '../exceptions/http.exception.js';

export function parseId(value: unknown): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestException('Invalid id');
  }
  return id;
}
