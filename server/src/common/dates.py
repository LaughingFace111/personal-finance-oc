from datetime import date


def get_local_business_date() -> date:
    """
    Return the current local business date for the running process.

    This is the local business day used for installment, credit-limit and
    similar account state events that should be stamped by local business date.
    """
    return date.today()
