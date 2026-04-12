"""
账户余额重算服务
基于 opening_balance + confirmed transactions 重算账户余额
"""
from decimal import Decimal
from typing import Dict, List
from sqlalchemy.orm import Session

from src.modules.accounts.models import Account
from src.modules.transactions.models import Transaction
from src.common.enums import AccountType, TransactionType, TransactionDirection, TransactionStatus


def _is_asset_account(account_type: str) -> bool:
    """Check if account type is asset"""
    return account_type in [AccountType.CASH, AccountType.DEBIT_CARD, AccountType.EWALLET, AccountType.VIRTUAL]


def _is_credit_account(account_type: str) -> bool:
    """Check if account type is credit"""
    return account_type in [AccountType.CREDIT_CARD, AccountType.CREDIT_LINE]


def _is_loan_account(account_type: str) -> bool:
    """Check if account type is loan"""
    return account_type == AccountType.LOAN


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

    # Get all confirmed transactions for this account
    txns = db.query(Transaction).filter(
        Transaction.account_id == account_id,
        Transaction.status == TransactionStatus.CONFIRMED.value
    ).all()

    # Calculate new balance/debt
    new_balance = account.opening_balance
    new_debt = Decimal("0")

    account_type = account.account_type

    for txn in txns:
        tx_type = txn.transaction_type
        direction = txn.direction
        amount = txn.amount

        if _is_asset_account(account_type):
            # Asset account balance calculation
            if tx_type == TransactionType.INCOME.value:
                if direction == TransactionDirection.IN.value:
                    new_balance += amount

            elif tx_type == TransactionType.EXPENSE.value:
                if direction == TransactionDirection.OUT.value:
                    new_balance -= amount

            elif tx_type == TransactionType.TRANSFER.value:
                # Transfer: handle both directions
                if direction == TransactionDirection.OUT.value:
                    new_balance -= amount
                else:
                    new_balance += amount

            elif tx_type == TransactionType.INSTALLMENT_PURCHASE.value:
                # Installment purchase: affects cash flow only (not balance)
                pass

            elif tx_type == TransactionType.REPAYMENT_CREDIT_CARD.value:
                # Credit card repayment: reduces debt
                pass

            elif tx_type == TransactionType.REPAYMENT_LOAN.value:
                # Loan repayment: reduces debt
                pass

            elif tx_type == TransactionType.REFUND.value:
                # Refund: if direction=in, add to balance
                if direction == TransactionDirection.IN.value:
                    new_balance += amount
                else:
                    new_balance -= amount

            elif tx_type == TransactionType.FEE.value:
                if direction == TransactionDirection.OUT.value:
                    new_balance -= amount

            elif tx_type == TransactionType.DEBT_BORROW.value:
                if direction == TransactionDirection.IN.value:
                    new_balance += amount

            elif tx_type == TransactionType.DEBT_LEND.value:
                if direction == TransactionDirection.OUT.value:
                    new_balance -= amount

            elif tx_type == TransactionType.DEBT_RECEIVE_BACK.value:
                if direction == TransactionDirection.IN.value:
                    new_balance += amount

            elif tx_type == TransactionType.DEBT_PAY_BACK.value:
                if direction == TransactionDirection.OUT.value:
                    new_balance -= amount

        elif _is_credit_account(account_type):
            # Credit account debt calculation
            if tx_type == TransactionType.EXPENSE.value:
                # Credit spending increases debt
                new_debt += amount

            elif tx_type == TransactionType.INSTALLMENT_PURCHASE.value:
                new_debt += amount

            elif tx_type == TransactionType.TRANSFER.value:
                # Transfer to credit account increases debt, from decreases debt
                if direction == TransactionDirection.IN.value:
                    new_debt += amount
                else:
                    new_debt -= amount

            elif tx_type == TransactionType.REFUND.value:
                # Refund to credit card reduces debt
                new_debt -= amount

            elif tx_type == TransactionType.REPAYMENT_CREDIT_CARD.value:
                # Repayment reduces debt
                new_debt -= amount

        elif _is_loan_account(account_type):
            # Loan account debt calculation
            if tx_type == TransactionType.DEBT_BORROW.value:
                # New borrowing increases loan principal
                new_debt += amount

            elif tx_type == TransactionType.TRANSFER.value:
                # Transfer to loan account increases debt, from decreases debt
                if direction == TransactionDirection.IN.value:
                    new_debt += amount
                else:
                    new_debt -= amount

            elif tx_type == TransactionType.REPAYMENT_LOAN.value:
                # Principal repayment reduces debt
                # (fee/interest is handled separately as fee type)
                new_debt -= amount

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
