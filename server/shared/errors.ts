// Ошибки серверного слоя.
//
// Сервисы не знают про HTTP: они бросают ApiError с кодом и машиночитаемой
// причиной, а тонкий endpoint переводит это в ответ. Так бизнес-правила можно
// читать и тестировать, не продираясь через req/res.

export class ApiError extends Error {
  readonly status: number;
  readonly reason?: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, message: string, reason?: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.reason = reason;
    this.details = details;
  }
}

export const badRequest   = (message: string, reason?: string) => new ApiError(400, message, reason);
export const unauthorized = (message = 'Authorization required') => new ApiError(401, message);
export const forbidden    = (message: string, reason?: string) => new ApiError(403, message, reason);
export const notFound     = (message: string, reason?: string) => new ApiError(404, message, reason);
export const conflict     = (message: string, reason?: string, details?: Record<string, unknown>) =>
  new ApiError(409, message, reason, details);
export const tooManyRequests = (message: string, details?: Record<string, unknown>) =>
  new ApiError(429, message, undefined, details);

// Тело ответа для ApiError. Внутренние подробности наружу не уходят —
// у неожиданных ошибок остаётся нейтральный текст, а детали пишутся в лог.
export function errorResponse(err: unknown, fallbackMessage: string): {
  status: number;
  body: Record<string, unknown>;
} {
  if (err instanceof ApiError) {
    return {
      status: err.status,
      body: {
        error: err.message,
        ...(err.reason ? { reason: err.reason } : {}),
        ...(err.details ?? {}),
      },
    };
  }
  return { status: 500, body: { error: fallbackMessage } };
}
