from importlib import import_module

__all__ = [
    "ImportBatch",
    "ImportRow",
    "router",
    "ImportBatchResponse",
    "ImportRowResponse",
    "UpdateImportRowRequest",
    "ConfirmImportRequest",
    "create_import_batch",
    "get_import_batches",
    "get_import_batch",
    "get_import_rows",
    "update_import_row",
    "confirm_import",
]


def __getattr__(name: str):
    if name in {"ImportBatch", "ImportRow"}:
        module = import_module(".models", __name__)
        return getattr(module, name)

    if name == "router":
        module = import_module(".router", __name__)
        return getattr(module, name)

    if name in {
        "ImportBatchResponse",
        "ImportRowResponse",
        "UpdateImportRowRequest",
        "ConfirmImportRequest",
    }:
        module = import_module(".schemas", __name__)
        return getattr(module, name)

    if name in {
        "create_import_batch",
        "get_import_batches",
        "get_import_batch",
        "get_import_rows",
        "update_import_row",
        "confirm_import",
    }:
        module = import_module(".service", __name__)
        return getattr(module, name)

    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
