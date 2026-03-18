from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.core import get_db, success_response
from src.core.auth import get_current_user

from .schemas import LoginRequest, LoginResponse, UserCreate, UserResponse
from .service import authenticate_user, create_user, create_token, get_user_by_id, update_user
from .models import User
from src.modules.books.service import get_default_book

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse)
def register(data: UserCreate, db: Session = Depends(get_db)):
    """Register new user"""
    user = create_user(db, data)
    return user


@router.post("/login", response_model=LoginResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    """Login user"""
    user = authenticate_user(db, data.email, data.password)
    token = create_token(user)
    # Get default book for the user
    default_book = get_default_book(db, user.id)
    if default_book:
        user.default_book_id = default_book.id
    return LoginResponse(
        access_token=token,
        user=user
    )


@router.get("/me", response_model=UserResponse)
def get_current_user_info(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user with default book"""
    # Get default book for the user
    default_book = get_default_book(db, current_user.id)
    if default_book:
        current_user.default_book_id = default_book.id
    return current_user
