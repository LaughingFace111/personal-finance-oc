from importlib import import_module

__all__ = [
    "User",
    "router",
    "LoginRequest",
    "LoginResponse",
    "UserCreate",
    "UserResponse",
    "UserUpdate",
    "create_user",
    "authenticate_user",
    "get_user_by_id",
    "get_user_by_email",
    "update_user",
]


def __getattr__(name: str):
    if name == "User":
        module = import_module(".models", __name__)
        return getattr(module, name)

    if name == "router":
        module = import_module(".router", __name__)
        return getattr(module, name)

    if name in {
        "LoginRequest",
        "LoginResponse",
        "UserCreate",
        "UserResponse",
        "UserUpdate",
    }:
        module = import_module(".schemas", __name__)
        return getattr(module, name)

    if name in {
        "create_user",
        "authenticate_user",
        "get_user_by_id",
        "get_user_by_email",
        "update_user",
    }:
        module = import_module(".service", __name__)
        return getattr(module, name)

    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
