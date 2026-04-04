from importlib import import_module

__all__ = [
    "Transaction",
    "router",
    "TransactionCreate",
    "TransactionResponse",
    "TransactionUpdate",
    "TransferCreate",
    "CreditCardRepaymentCreate",
    "RefundCreate",
    "TransactionFilter",
    "TransactionSummary",
    "create_transaction",
    "create_transfer",
    "create_credit_card_repayment",
    "create_refund",
    "get_transactions",
    "get_transaction",
    "update_transaction",
    "delete_transaction",
]


def __getattr__(name: str):
    if name == "Transaction":
        module = import_module(".models", __name__)
        return getattr(module, name)

    if name == "router":
        module = import_module(".router", __name__)
        return getattr(module, name)

    if name in {
        "TransactionCreate",
        "TransactionResponse",
        "TransactionUpdate",
        "TransferCreate",
        "CreditCardRepaymentCreate",
        "RefundCreate",
        "TransactionFilter",
        "TransactionSummary",
    }:
        module = import_module(".schemas", __name__)
        return getattr(module, name)

    if name in {
        "create_transaction",
        "create_transfer",
        "create_credit_card_repayment",
        "create_refund",
        "get_transactions",
        "get_transaction",
        "update_transaction",
        "delete_transaction",
    }:
        module = import_module(".service", __name__)
        return getattr(module, name)

    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
