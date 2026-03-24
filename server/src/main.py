from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.core import settings, init_db
from src.core.config import settings as app_settings

from src.modules.auth import router as auth_router
from src.modules.books import router as books_router
from src.modules.accounts import router as accounts_router
from src.modules.categories import router as categories_router
from src.modules.transactions import router as transactions_router
from src.modules.installments import router as installments_router
from src.modules.loans import router as loans_router
from src.modules.imports import router as imports_router
from src.modules.import_templates import router as import_templates_router
from src.modules.rules import router as rules_router
from src.modules.recurring_rules import router as recurring_rules_router
from src.modules.recurring_pending import router as recurring_pending_router
from src.modules.reports import router as reports_router
from src.modules.tags import router as tags_router
from src.modules.bills import router as bills_router
from src.modules.account_balance_snapshots import AccountBalanceSnapshot  # noqa: F401
from src.modules.import_templates import ImportTemplate  # noqa: F401
from src.modules.recurring_rules import RecurringRule  # noqa: F401
from src.modules.recurring_pending import PendingItem  # noqa: F401

# Create FastAPI app
app = FastAPI(
    title=app_settings.APP_NAME,
    version=app_settings.APP_VERSION,
    debug=app_settings.DEBUG,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=app_settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event():
    """Initialize database on startup"""
    init_db()


# Include routers
app.include_router(auth_router, prefix="/api")
app.include_router(books_router, prefix="/api")
app.include_router(accounts_router, prefix="/api")
app.include_router(categories_router, prefix="/api")
app.include_router(transactions_router, prefix="/api")
app.include_router(installments_router, prefix="/api")
app.include_router(loans_router, prefix="/api")
app.include_router(imports_router, prefix="/api")
app.include_router(import_templates_router, prefix="/api")
app.include_router(rules_router, prefix="/api")
app.include_router(recurring_rules_router, prefix="/api")
app.include_router(recurring_pending_router, prefix="/api")
app.include_router(reports_router, prefix="/api")
app.include_router(tags_router, prefix="/api")
app.include_router(bills_router, prefix="/api")


@app.get("/")
def root():
    return {"message": "Personal Finance API", "version": app_settings.APP_VERSION}


@app.get("/health")
def health():
    return {"status": "healthy"}
