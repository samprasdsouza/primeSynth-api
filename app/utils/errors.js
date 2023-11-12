class DomainsAPIError extends Error {
    constructor (message, stack) {
      super(message)
      this.title = this.constructor.name
      this.status = 400
      this.detail = message
      this.errorStack = stack
    }
  }
  
  class BadRequestError extends DomainsAPIError {
    constructor (message, stack) {
      super(message)
      this.title = this.constructor.name
      this.status = 400
      this.detail = message
      this.errorStack = stack
    }
  }
  
  class UnauthorizedError extends DomainsAPIError {
    constructor (message, stack) {
      super(message)
      this.title = this.constructor.name
      this.status = 401
      this.detail = message
      this.errorStack = stack
    }
  }
  
  class ForbiddenError extends DomainsAPIError {
    constructor (message) {
      super(message)
      this.title = this.constructor.name
      this.status = 403
      this.detail = message
    }
  }
  
  class NotFoundError extends DomainsAPIError {
    constructor (message) {
      super(message)
      this.title = this.constructor.name
      this.status = 404
      this.detail = message
    }
  }
  
  class ConflictError extends DomainsAPIError {
    constructor (message, stack) {
      super(message)
      this.title = this.constructor.name
      this.status = 409
      this.detail = message
      this.errorStack = stack
    }
  }
  
  class InternalServerError extends DomainsAPIError {
    constructor (message, stack) {
      super(message)
      this.title = this.constructor.name
      this.status = 500
      this.detail = message
      this.errorStack = stack
    }
  }
  
  class NotImplementedError extends DomainsAPIError {
    constructor (message, stack) {
      super(message)
      this.title = this.constructor.name
      this.status = 501
      this.detail = message
      this.errorStack = stack
    }
  }
  
  class DependencyError extends DomainsAPIError {
    constructor (message, stack) {
      super(message)
      this.title = this.constructor.name
      this.status = 503
      this.detail = message
      this.errorStack = stack
    }
  }
  
  class UnprocessableEntityError extends DomainsAPIError {
    constructor (message, stack) {
      super(message)
      this.title = this.constructor.name
      this.status = 422
      this.detail = message
      this.errorStack = stack
    }
  }
  
  module.exports = {
    BadRequestError,
    DependencyError,
    ForbiddenError,
    InternalServerError,
    NotFoundError,
    UnauthorizedError,
    ConflictError,
    NotImplementedError,
    UnprocessableEntityError,
    DomainsAPIError
  }
  