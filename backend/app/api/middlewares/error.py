from fastapi.responses import JSONResponse
from fastapi.requests import Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

# 404 핸들러
async def not_found_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=404, content={"message": f"Not Found - {request.url.path}"})

# 에러 핸들러
async def error_handler(request: Request, exc: Exception):
    status_code = 500
    if isinstance(exc, StarletteHTTPException):
        status_code = exc.status_code
    elif isinstance(exc, RequestValidationError):
        status_code = 422

    return JSONResponse(
        status_code=status_code,
        content={
            "message": str(exc),
            "stack": "🥞" if request.app.state.env == "production" else repr(exc),
        },
    )