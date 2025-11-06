"""
Main FastAPI application.
"""
from fastapi import FastAPI
from config import settings
from app.websockets import websocket_router
# Create FastAPI application
app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url="/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    debug=settings.DEBUG
)

app.include_router(websocket_router, prefix="/api/v1")


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


