/**
 * Typed error hierarchy for Sketricgen SDK.
 * @see TS_NODE_SDK_PLAN.md Section 4
 */

export class SketricGenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SketricGenError';
    Object.setPrototypeOf(this, SketricGenError.prototype);
  }
}

export class SketricGenAPIError extends SketricGenError {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody?: unknown,
    public readonly requestId?: string
  ) {
    super(message);
    this.name = 'SketricGenAPIError';
    Object.setPrototypeOf(this, SketricGenAPIError.prototype);
  }
}

export class SketricGenAuthenticationError extends SketricGenAPIError {
  constructor(
    message: string,
    statusCode: number = 401,
    responseBody?: unknown,
    requestId?: string
  ) {
    super(message, statusCode, responseBody, requestId);
    this.name = 'SketricGenAuthenticationError';
    Object.setPrototypeOf(this, SketricGenAuthenticationError.prototype);
  }
}

export class SketricGenValidationError extends SketricGenError {
  constructor(message: string) {
    super(message);
    this.name = 'SketricGenValidationError';
    Object.setPrototypeOf(this, SketricGenValidationError.prototype);
  }
}

export class SketricGenNetworkError extends SketricGenError {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'SketricGenNetworkError';
    Object.setPrototypeOf(this, SketricGenNetworkError.prototype);
  }
}

export class SketricGenTimeoutError extends SketricGenError {
  constructor(message: string) {
    super(message);
    this.name = 'SketricGenTimeoutError';
    Object.setPrototypeOf(this, SketricGenTimeoutError.prototype);
  }
}

export class SketricGenUploadError extends SketricGenError {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'SketricGenUploadError';
    Object.setPrototypeOf(this, SketricGenUploadError.prototype);
  }
}

export class SketricGenFileSizeError extends SketricGenError {
  constructor(
    message: string,
    public readonly fileSize: number,
    public readonly maxSize: number
  ) {
    super(message);
    this.name = 'SketricGenFileSizeError';
    Object.setPrototypeOf(this, SketricGenFileSizeError.prototype);
  }
}

export class SketricGenContentTypeError extends SketricGenError {
  constructor(
    message: string,
    public readonly contentType: string,
    public readonly allowedTypes: string[]
  ) {
    super(message);
    this.name = 'SketricGenContentTypeError';
    Object.setPrototypeOf(this, SketricGenContentTypeError.prototype);
  }
}
