export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
    this.expose = true;
  }
  static badRequest(m = 'Bad request', d) { return new ApiError(400, m, d); }
  static unauthorized(m = 'You need to sign in') { return new ApiError(401, m); }
  static forbidden(m = 'You do not have access to this') { return new ApiError(403, m); }
  static notFound(m = 'Not found') { return new ApiError(404, m); }
  static conflict(m = 'Already exists') { return new ApiError(409, m); }
  static tooMany(m = 'Too many requests') { return new ApiError(429, m); }
  static upstream(m = 'Upstream service failed', d) { return new ApiError(502, m, d); }
}
