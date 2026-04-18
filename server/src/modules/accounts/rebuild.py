"""
账户余额重算服务
基于 opening_balance + confirmed transactions 重算账户余额
"""
from decimal import Decimal
from typing import Dict, List
from sqlalchemy.orm import Session
from sqlalchemy import or_

from src.modules.accounts.models import Account
from src.modules.transactions.models import Transaction
from src.common.enums import AccountType, TransactionType, TransactionDirection, TransactionStatus
from src.modules.loans.models import LoanPlan


def _is_asset_account(account_type: str) -> bool:
    """Check if account type is asset"""
    return account_type in [AccountType.CASH, AccountType.DEBIT_CARD, AccountType.EWALLET, AccountType.VIRTUAL]


def _is_credit_account(account_type: str) -> bool:
    """Check if account type is credit"""
    return account_type in [AccountType.CREDIT_CARD, AccountType.CREDIT_LINE]


def _is_loan_account(account_type: str) -> bool:
    """Check if account type is loan"""
    return account_type == AccountType.LOAN


def _to_value(raw) -> str:
    return raw.value if hasattr(raw, "value") else raw


def _apply_rebuild_delta(
    *,
    account_id: str,
    account_type: str,
    txn: Transaction,
    is_primary: bool,
    balance: Decimal,
    debt: Decimal,
) -> tuple[Decimal, Decimal]:
    tx_type = _to_value(txn.transaction_type)
    direction = _to_value(txn.direction)
    amount = Decimal(str(txn.amount or 0))

    if _is_asset_account(account_type):
        if is_primary:
            if tx_type == TransactionType.INCOME.value and direction == TransactionDirection.IN.value:
                balance += amount
            elif tx_type == TransactionType.EXPENSE.value and direction == TransactionDirection.OUT.value:
                balance -= amount
            elif tx_type == TransactionType.TRANSFER.value:
                balance += amount if direction == TransactionDirection.IN.value else -amount
            elif tx_type == TransactionType.REFUND.value:
                balance += amount if direction == TransactionDirection.IN.value else -amount
            elif tx_type == TransactionType.FEE.value and direction == TransactionDirection.OUT.value:
                balance -= amount
            elif tx_type == TransactionType.DEBT_BORROW.value and direction == TransactionDirection.IN.value:
                balance += amount
            elif tx_type == TransactionType.DEBT_LEND.value and direction == TransactionDirection.OUT.value:
                balance -= amount
            elif tx_type == TransactionType.DEBT_RECEIVE_BACK.value and direction == TransactionDirection.IN.value:
                balance += amount
            elif tx_type == TransactionType.DEBT_PAY_BACK.value and direction == TransactionDirection.OUT.value:
                balance -= amount
        else:
            if tx_type == TransactionType.TRANSFER.value and not txn.related_transaction_id:
                balance += amount
        return balance, debt

    if _is_credit_account(account_type):
        if is_primary:
            if tx_type in {TransactionType.EXPENSE.value, TransactionType.INSTALLMENT_PURCHASE.value}:
                debt += amount
            elif tx_type == TransactionType.FEE.value:
                debt += amount
            elif tx_type in {TransactionType.REFUND.value, TransactionType.INCOME.value}:
                debt -= amount
            elif tx_type == TransactionType.TRANSFER.value:
                debt += amount if direction == TransactionDirection.OUT.value else -amount
        else:
            if tx_type in {TransactionType.REPAYMENT_CREDIT_CARD.value, TransactionType.TRANSFER.value} and not txn.related_transaction_id:
                debt -= amount
        return balance, debt

    if _is_loan_account(account_type):
        if is_primary:
            if tx_type == TransactionType.DEBT_BORROW.value:
                debt += amount
            elif tx_type == TransactionType.TRANSFER.value:
                debt += amount if direction == TransactionDirection.OUT.value else -amount
        else:
            if tx_type in {TransactionType.REPAYMENT_LOAN.value, TransactionType.TRANSFER.value} and not txn.related_transaction_id:
                debt -= amount
        return balance, debt

    return balance, debt


def rebuild_account_balance(db: Session, account_id: str) -> Dict:
    """
    重算单个账户的余额/负债

    规则:
    - 资产类账户 (cash/debit_card/ewallet/virtual):
      - current_balance = opening_balance
      - + income (direction=in)
      - - expense (direction=out)
      - + refund (to this account, direction=in)
      - - refund (from this account, direction=out)
      - + transfer in
      - - transfer out
      - + debt_borrow
      - - debt_lend
      - + debt_receive_back
      - - debt_pay_back
      - - fee

    - 信用类账户 (credit_card/credit_line):
      - debt_amount:
      - + expense (debt increase)
      - + installment_purchase (debt increase)
      - - refund (debt decrease)
      - - repayment_credit_card (debt decrease)

    - 贷款类账户 (loan):
      - debt_amount:
      - + debt_borrow (新增借款)
      - - repayment_loan (本金还款减少)
      - 利息(fee)不减少贷款本金

    返回:
    {
        "account_id": str,
        "old_balance": Decimal,
        "new_balance": Decimal,
        "old_debt": Decimal,
        "new_debt": Decimal,
    }
    """
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        return {"error": "Account not found"}

    old_balance = account.current_balance
    old_debt = account.debt_amount

    # Get all confirmed transactions that affect this account either directly
    # or via counterparty linkage (credit-card repayment / loan repayment / transfer).
    txns = db.query(Transaction).filter(
        or_(
            Transaction.account_id == account_id,
            Transaction.counterparty_account_id == account_id,
        ),
        Transaction.status == TransactionStatus.CONFIRMED.value
    ).order_by(Transaction.occurred_at.asc(), Transaction.created_at.asc()).all()

    # Calculate new balance/debt
    # IMPORTANT: For credit accounts, we DO NOT replay transactions.
    # create_transaction already applies effects to debt_amount in real-time.
    # Rebuilding would double-count: transaction effects were already applied.
    # For credit accounts: new_debt = current debt_amount (no replay needed).
    # For loan accounts: replay loan BORROW transactions from opening_balance.
    # For asset accounts: replay all transactions.
    new_balance = account.opening_balance
    if _is_loan_account(account.account_type):
        new_debt = Decimal(str(account.opening_balance or 0))  # loan: opening_balance = initial principal
    elif _is_credit_account(account.account_type):
        new_debt = Decimal(str(account.debt_amount or 0))  # credit: preserve current debt (no replay)
    else:
        new_debt = Decimal("0")

    account_type = account.account_type

    # Skip transaction replay for credit accounts (real-time updates already applied)
    if not _is_credit_account(account.account_type):
        for txn in txns:
            is_primary = txn.account_id == account_id
            new_balance, new_debt = _apply_rebuild_delta(
                account_id=account_id,
                account_type=account_type,
                txn=txn,
                is_primary=is_primary,
                balance=new_balance,
                debt=new_debt,
            )

    if _is_loan_account(account_type):
        principal_remaining = db.query(LoanPlan).filter(
            LoanPlan.account_id == account_id
        ).with_entities(LoanPlan.principal_remaining).all()
        if principal_remaining:
            new_debt = sum((Decimal(str(item[0] or 0)) for item in principal_remaining), Decimal("0"))

    # Update account
    account.current_balance = new_balance
    account.debt_amount = max(Decimal("0"), new_debt)  # Prevent negative debt
    db.commit()
    db.refresh(account)

    return {
        "account_id": account_id,
        "account_name": account.name,
        "account_type": account_type,
        "old_balance": old_balance,
        "new_balance": new_balance,
        "old_debt": old_debt,
        "new_debt": account.debt_amount,
        "transaction_count": len(txns),
    }


def rebuild_book_accounts(db: Session, book_id: str) -> List[Dict]:
    """
    重算账本下所有账户的余额/负债

    返回每个账户的重算结果列表
    """
    accounts = db.query(Account).filter(
        Account.book_id == book_id,
        Account.is_active == True
    ).all()

    results = []
    for acc in accounts:
        result = rebuild_account_balance(db, acc.id)
        results.append(result)

    return results
