from typing import Any, Optional

from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel


class ResponseModel(BaseModel):
    """Standard API response"""
    code: int = 0
    message: str = "ok"
    data: Any = None
    request_id: Optional[str] = None


def success_response(data: Any = None, message: str = "ok") -> ResponseModel:
    """Success response helper"""
    return ResponseModel(code=0, message=message, data=data)


def error_response(code: int, message: str, status_code: int = 400) -> JSONResponse:
    """Error response helper"""
    return JSONResponse(
        status_code=status_code,
        content={"code": code, "message": message, "data": None}
    )


class AppException(HTTPException):
    """Application exception"""
    def __init__(self, status_code: int, code: int, message: str):
        super().__init__(status_code=status_code, detail=message)
        self.code = code
        self.message = message


class NotFoundException(AppException):
    def __init__(self, message: str = "Resource not found"):
        super().__init__(status_code=404, code=40401, message=message)


class ValidationException(AppException):
    def __init__(self, message: str = "Validation error"):
        super().__init__(status_code=422, code=42201, message=message)


class UnauthorizedException(AppException):
    def __init__(self, message: str = "Unauthorized"):
        super().__init__(status_code=401, code=40101, message=message)


class IdempotencyException(AppException):
    def __init__(self, message: str = "Duplicate resource"):
        super().__init__(status_code=409, code=40901, message=message)


# Error code constants
class ErrorCode:
    # Generic
    INVALID_PARAMS = 40001
    NOT_FOUND = 40401
    UNAUTHORIZED = 40101
    FORBIDDEN = 40301
    CONFLICT = 40901
    INTERNAL_ERROR = 50001

    # Auth
    INVALID_CREDENTIALS = 40101
    TOKEN_EXPIRED = 40102

    # Business
    ACCOUNT_NOT_FOUND = 40401
    CATEGORY_NOT_FOUND = 40402
    TRANSACTION_NOT_FOUND = 40403
    INSUFFICIENT_BALANCE = 40002
    INVALID_STATE = 40003
    DUPLICATE_ENTRY = 40902
