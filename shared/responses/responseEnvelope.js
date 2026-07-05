export function successResponse({ message, data, meta, requestId } = {}) {
  return {
    success: true,
    ...(message ? { message } : null),
    ...(data !== undefined ? { data } : { data: null }),
    ...(meta ? { meta } : null),
    ...(requestId ? { requestId } : null),
  };
}

export function errorResponse({ message, code, details, requestId } = {}) {
  return {
    success: false,
    error: {
      message,
      ...(code ? { code } : null),
      ...(details ? { details } : null),
    },
    ...(requestId ? { requestId } : null),
  };
}

