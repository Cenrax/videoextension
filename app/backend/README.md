
#  Backend

A FastAPI-based backend service for the intusMind project.

## Prerequisites

- Python 3.x
- pip (Python package installer)

## Setup and Installation

### 1. Environment Setup

1. Clone the repository
2. Copy the environment example file and configure your environment variables:
   ```bash
   cp env.example .env
   ```
3. Update the `.env` file with your specific configuration values

### 2. Virtual Environment Setup

Create and activate a virtual environment:

#### Windows
```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment (Command Prompt)
venv\Scripts\activate

# Note: If using VS Code terminal, you may need to use Command Prompt 
# for proper virtual environment activation
```

#### Linux/Mac
```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
source venv/bin/activate
```

### 3. Install Dependencies

Once the virtual environment is activated, install the required packages:

```bash
pip install -r requirements.txt
```

### 4. Running the Application

#### Start the FastAPI server:
```bash
uvicorn app.main:app --reload
```


## Production Deployment

For production environments, use Gunicorn:
```bash
gunicorn -k uvicorn.workers.UvicornWorker app.main:app
```

## Development

- The application uses FastAPI framework
- Hot reload is enabled during development
- The main application entry point is `app/main.py`

## Troubleshooting

1. If you encounter issues with virtual environment activation in VS Code:
   - Use Command Prompt instead of VS Code's integrated terminal
   - Ensure you're in the project's root directory

2. If packages are not found after installation:
   - Verify that the virtual environment is activated
   - Try reinstalling dependencies

3. Redis connection issues:
   - Ensure Redis server is running (`redis-cli ping` should return "PONG")
   - Check that your .env file has the correct Redis configuration
   - Verify firewall settings if connecting to a remote Redis instance
