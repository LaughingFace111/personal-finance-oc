from enum import Enum


# Account types
class AccountType(str, Enum):
    CASH = "cash"
    DEBIT_CARD = "debit_card"
    EWALLET = "ewallet"
    CREDIT_CARD = "credit_card"
    CREDIT_LINE = "credit_line"
    LOAN = "loan"
    VIRTUAL = "virtual"


# Category types
class CategoryType(str, Enum):
    EXPENSE = "expense"
    INCOME = "income"
    TRANSFER = "transfer"
    REPAYMENT = "repayment"
    ADJUSTMENT = "adjustment"
    REFUND = "refund"


# Transaction types
class TransactionType(str, Enum):
    EXPENSE = "expense"
    INCOME = "income"
    TRANSFER = "transfer"
    REPAYMENT_CREDIT_CARD = "repayment_credit_card"
    REPAYMENT_LOAN = "repayment_loan"
    REFUND = "refund"
    FEE = "fee"
    ADJUSTMENT = "adjustment"
    INSTALLMENT_PURCHASE = "installment_purchase"
    DEBT_BORROW = "debt_borrow"
    DEBT_LEND = "debt_lend"
    DEBT_RECEIVE_BACK = "debt_receive_back"
    DEBT_PAY_BACK = "debt_pay_back"


# Transaction direction
class TransactionDirection(str, Enum):
    IN = "in"
    OUT = "out"
    INTERNAL = "internal"


# Transaction status
class TransactionStatus(str, Enum):
    DRAFT = "draft"
    CONFIRMED = "confirmed"
    VOID = "void"


# Source type
class SourceType(str, Enum):
    MANUAL = "manual"
    IMPORT = "import"
    SYSTEM = "system"
    EXTERNAL = "external"


# Import status
class ImportStatus(str, Enum):
    UPLOADED = "uploaded"
    PARSED = "parsed"
    REVIEWING = "reviewing"
    CONFIRMED = "confirmed"
    FAILED = "failed"


# Confirm status
class ConfirmStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    SKIPPED = "skipped"


# Installment/Loan status
class PlanStatus(str, Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


# User status
class UserStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
