from datetime import datetime, timezone

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from urllib.parse import quote

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.security import (
    REFRESH_COOKIE_NAME,
    create_access_token,
    create_refresh_token,
    hash_token,
    verify_token_hash,
)
from app.crud import crud_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import AuthProvidersResponse, TokenResponse, UserCreate, UserRead

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

oauth = OAuth()

google_client_id = settings.google_client_id.strip()
google_client_secret = settings.google_client_secret.strip()
github_client_id = settings.github_client_id.strip()
github_client_secret = settings.github_client_secret.strip()

if google_client_id and google_client_secret:
    oauth.register(
        name="google",
        client_id=google_client_id,
        client_secret=google_client_secret,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )

if github_client_id and github_client_secret:
    oauth.register(
        name="github",
        client_id=github_client_id,
        client_secret=github_client_secret,
        access_token_url="https://github.com/login/oauth/access_token",
        authorize_url="https://github.com/login/oauth/authorize",
        api_base_url="https://api.github.com/",
        client_kwargs={"scope": "user:email"},
    )


def _set_refresh_cookie(response: RedirectResponse, refresh_token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.refresh_token_expire_days * 86400,
        path="/",
    )


def _clear_refresh_cookie(response) -> None:
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path="/")
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path="/api/v1/auth")


async def _issue_tokens(user: User, db: AsyncSession) -> tuple[str, str]:
    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token()
    user.last_login_at = datetime.now(timezone.utc)
    await crud_user.update_refresh_token_hash(db, user, hash_token(refresh_token))
    return access_token, refresh_token


async def _user_from_refresh_token(
    db: AsyncSession,
    refresh_token_value: str | None,
) -> User | None:
    if not refresh_token_value:
        return None

    token_hash = hash_token(refresh_token_value)

    from sqlalchemy import select

    result = await db.execute(select(User).where(User.refresh_token_hash == token_hash))
    user = result.scalar_one_or_none()

    if user is None or not verify_token_hash(refresh_token_value, user.refresh_token_hash):
        return None

    return user


async def _upsert_oauth_user(
    db: AsyncSession,
    *,
    provider: str,
    provider_id: str,
    email: str,
    name: str,
    avatar_url: str | None,
) -> User:
    user = await crud_user.get_by_provider(db, provider, provider_id)
    if user:
        user.email = email
        user.name = name
        user.avatar_url = avatar_url
        await db.flush()
        await db.refresh(user)
        return user

    existing = await crud_user.get_by_email(db, email)
    if existing:
        existing.provider = provider
        existing.provider_id = provider_id
        existing.name = name
        existing.avatar_url = avatar_url
        existing.is_active = True
        await db.flush()
        await db.refresh(existing)
        return existing

    return await crud_user.create(
        db,
        UserCreate(
            email=email,
            name=name,
            avatar_url=avatar_url,
            provider=provider,
            provider_id=provider_id,
        ),
    )


@router.get("/providers", response_model=AuthProvidersResponse)
async def list_providers():
    return AuthProvidersResponse(
        google=bool(settings.google_client_id and settings.google_client_secret),
        github=bool(settings.github_client_id and settings.github_client_secret),
    )


def _google_configured() -> bool:
    return bool(google_client_id and google_client_secret)


def _github_configured() -> bool:
    return bool(github_client_id and github_client_secret)


@router.get("/google/login")
async def google_login(request: Request, next: str = Query("/", alias="next")):
    if not _google_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Google OAuth not configured")
    request.session["oauth_next"] = next if next.startswith("/") else "/"
    redirect_uri = settings.google_redirect_uri
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback")
async def google_callback(request: Request, db: AsyncSession = Depends(get_db)):
    if not _google_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Google OAuth not configured")

    token = await oauth.google.authorize_access_token(request)
    userinfo = token.get("userinfo")
    if not userinfo:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to fetch Google profile")

    user = await _upsert_oauth_user(
        db,
        provider="google",
        provider_id=userinfo["sub"],
        email=userinfo["email"],
        name=userinfo.get("name") or userinfo["email"].split("@")[0],
        avatar_url=userinfo.get("picture"),
    )

    access_token, refresh_token = await _issue_tokens(user, db)
    next_path = request.session.pop("oauth_next", "/")
    response = RedirectResponse(url=f"{settings.frontend_url}/auth/callback?next={quote(next_path, safe='/')}")
    _set_refresh_cookie(response, refresh_token)
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=False,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )
    return response


@router.get("/github/login")
async def github_login(request: Request, next: str = Query("/", alias="next")):
    if not _github_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="GitHub OAuth not configured")
    request.session["oauth_next"] = next if next.startswith("/") else "/"
    redirect_uri = settings.github_redirect_uri
    return await oauth.github.authorize_redirect(request, redirect_uri)


@router.get("/github/callback")
async def github_callback(request: Request, db: AsyncSession = Depends(get_db)):
    if not _github_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="GitHub OAuth not configured")

    token = await oauth.github.authorize_access_token(request)
    resp = await oauth.github.get("user", token=token)
    profile = resp.json()

    email = profile.get("email")
    if not email:
        emails_resp = await oauth.github.get("user/emails", token=token)
        emails = emails_resp.json()
        primary = next((e for e in emails if e.get("primary")), None)
        email = primary["email"] if primary else None

    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="GitHub account has no public email")

    user = await _upsert_oauth_user(
        db,
        provider="github",
        provider_id=str(profile["id"]),
        email=email,
        name=profile.get("name") or profile.get("login") or email.split("@")[0],
        avatar_url=profile.get("avatar_url"),
    )

    access_token, refresh_token = await _issue_tokens(user, db)
    next_path = request.session.pop("oauth_next", "/")
    response = RedirectResponse(url=f"{settings.frontend_url}/auth/callback?next={quote(next_path, safe='/')}")
    _set_refresh_cookie(response, refresh_token)
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=False,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )
    return response


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(request: Request, db: AsyncSession = Depends(get_db)):
    refresh_token_value = request.cookies.get(REFRESH_COOKIE_NAME)
    user = await _user_from_refresh_token(db, refresh_token_value)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    new_access_token, new_refresh_token = await _issue_tokens(user, db)

    from fastapi.responses import JSONResponse

    response = JSONResponse(content={"access_token": new_access_token, "token_type": "bearer"})
    _set_refresh_cookie(response, new_refresh_token)
    return response


@router.post("/bootstrap")
async def bootstrap_auth(request: Request, db: AsyncSession = Depends(get_db)):
    refresh_token_value = request.cookies.get(REFRESH_COOKIE_NAME)
    user = await _user_from_refresh_token(db, refresh_token_value)

    from fastapi.responses import JSONResponse

    if user is None:
        response = JSONResponse(content={"authenticated": False})
        _clear_refresh_cookie(response)
        response.delete_cookie(key="access_token", path="/")
        return response

    access_token, refresh_token = await _issue_tokens(user, db)
    response = JSONResponse(
        content={
            "authenticated": True,
            "access_token": access_token,
            "token_type": "bearer",
        }
    )
    _set_refresh_cookie(response, refresh_token)
    return response


@router.post("/logout")
async def logout(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await crud_user.update_refresh_token_hash(db, current_user, None)

    from fastapi.responses import JSONResponse

    response = JSONResponse(content={"message": "Logged out"})
    _clear_refresh_cookie(response)
    response.delete_cookie(key="access_token", path="/")
    return response


@router.get("/me", response_model=UserRead)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user
