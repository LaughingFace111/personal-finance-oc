from importlib import import_module

__all__ = [
    "router",
    "BillImportResponse",
    "ParsedBillRecord",
    "ParsedBillItem",
    "ParseBillResponse",
    "ConfirmImportRequest",
    "ConfirmImportResponse",
    "import_bill_file",
    "parse_bill_file",
    "get_parse_result",
    "confirm_import",
]


def __getattr__(name: str):
    if name == "router":
        module = import_module(".router", __name__)
        return getattr(module, name)

    if name in {
        "BillImportResponse",
        "ParsedBillRecord",
        "ParsedBillItem",
        "ParseBillResponse",
        "ConfirmImportRequest",
        "ConfirmImportResponse",
    }:
        module = import_module(".schemas", __name__)
        return getattr(module, name)

    if name in {
        "import_bill_file",
        "parse_bill_file",
        "get_parse_result",
        "confirm_import",
    }:
        module = import_module(".service", __name__)
        return getattr(module, name)

    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
