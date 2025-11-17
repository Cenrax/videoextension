"""
Main FastAPI application.
"""
from fastapi import FastAPI
from config import settings
from app.websockets import websocket_router
from app.api import screenshot_router
from fastapi.middleware.cors import CORSMiddleware

# Create FastAPI application
app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url="/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    debug=settings.DEBUG
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # adjust
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_prefix = settings.API_V1_STR or "/api/v1"
app.include_router(websocket_router, prefix=api_prefix)
app.include_router(screenshot_router, prefix=api_prefix)


@app.on_event("startup")
async def startup_event():
    """Run startup events."""
    pass
    

@app.on_event("shutdown")
async def shutdown_event():
    """Run shutdown events."""
    pass
    

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG
    )


