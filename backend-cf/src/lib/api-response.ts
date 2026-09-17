export type ApiResponse<T = unknown> = {
  success: boolean;
  message: string;
  data?: T;
};

export function ok<T>(data: T, message = 'OK'): ApiResponse<T> {
  const response: ApiResponse<T> = { success: true, message };
  if (data !== undefined) {
    response.data = data;
  }
  return response;
}

export function fail(message: string): ApiResponse<never> {
  return { success: false, message };
}
