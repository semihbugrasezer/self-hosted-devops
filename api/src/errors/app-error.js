class AppError extends Error {
  constructor(message, statusCode = 500, code = "APP_ERROR", details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

class ValidationError extends AppError {
  constructor(message, details = {}) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

class GitError extends AppError {
  constructor(message, details = {}) {
    super(message, 502, "GIT_ERROR", details);
  }
}

class DockerBuildError extends AppError {
  constructor(message, details = {}) {
    super(message, 502, "DOCKER_BUILD_ERROR", details);
  }
}

class ContainerRuntimeError extends AppError {
  constructor(message, details = {}) {
    super(message, 502, "CONTAINER_RUNTIME_ERROR", details);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
  }
}

module.exports = {
  AppError,
  ValidationError,
  GitError,
  DockerBuildError,
  ContainerRuntimeError,
  UnauthorizedError,
};
