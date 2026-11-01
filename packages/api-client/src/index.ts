export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
export function createApiClient(
  baseUrl: string,
  token: () => string | undefined,
) {
  return async function request<T>(
    path: string,
    body?: unknown,
    method = body === undefined ? 'GET' : 'POST',
  ): Promise<T> {
    const access = token();
    const response = await fetch(baseUrl.replace(/\/$/, '') + '/v1/' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(access ? { Authorization: 'Bearer ' + access } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const value: unknown = await response.json();
    if (!response.ok) {
      const message =
        value && typeof value === 'object' && 'message' in value
          ? JSON.stringify(value.message)
          : 'Request failed';
      throw new ApiError(response.status, message);
    }
    return value as T;
  };
}
