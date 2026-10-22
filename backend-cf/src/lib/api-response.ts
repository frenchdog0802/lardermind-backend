import { ErrorCodes, type ErrorCode } from './error-codes';

export type ApiResponse<T = unknown> = {
  success: boolean;
  message: string;
  code?: string;
  requestId?: string;
  data?: T;
};

export function ok<T>(data: T, message = 'OK'): ApiResponse<T> {
  const response: ApiResponse<T> = { success: true, message };
  if (data !== undefined) {
    response.data = data;
  }
  return response;
}

export function fail(
  message: string,
  code: ErrorCode | string = ErrorCodes.ERROR,
): ApiResponse<never> {
  return { success: false, message, code };
}
