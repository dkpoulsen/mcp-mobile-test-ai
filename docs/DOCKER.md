# Docker Guide for MCP Mobile Test AI

This guide covers how to use Docker to run the MCP Mobile Test AI framework with its dependencies (PostgreSQL and Redis) in isolated, reproducible environments.

## Prerequisites

- Docker Engine 20.10 or later
- Docker Compose v2 or later

## Quick Start

### Start All Services

```bash
# Start PostgreSQL, Redis, and the API server
docker compose up -d

# Or start with API profile enabled
docker compose --profile api up -d
```

### Run Tests in Docker

```bash
# Run tests using the test-specific compose configuration
docker compose -f docker-compose.test.yml up --abort-on-container-exit
```

### Stop Services

```bash
# Stop all services
docker compose down

# Stop and remove volumes (deletes all data)
docker compose down -v
```

## Services

### PostgreSQL

| Setting | Default |
|---------|---------|
| Image | postgres:16-alpine |
| Port | 5432 |
| User | mcpmobile |
| Password | mcpmobilepass |
| Database | mcpmobiletest |

### Redis

| Setting | Default |
|---------|---------|
| Image | redis:7-alpine |
| Port | 6379 |
| Password | redispass |

### Test Runner

The test runner service executes the test suite with the following environment:

- In-memory PostgreSQL for faster tests
- Redis without persistence
- Isolated test network

## Configuration

### Environment Variables

Create a `.env` file to customize Docker services:

```bash
# PostgreSQL
POSTGRES_USER=mcpmobile
POSTGRES_PASSWORD=mcpmobilepass
POSTGRES_DB=mcpmobiletest
POSTGRES_PORT=5432

# Redis
REDIS_PASSWORD=redispass
REDIS_PORT=6379

# API
API_PORT=3000

# LLM (for API service)
LLM_PROVIDER=openai
LLM_API_KEY=your-key-here
LLM_MODEL=gpt-4
```

### Test Environment Variables

For test-specific configuration:

```bash
# Test Database (uses different port)
TEST_POSTGRES_PORT=5433
TEST_REDIS_PORT=6380
```

## Docker Files

- `Dockerfile` - Production-ready multi-stage build for the API server
- `Dockerfile.test` - Test environment with Playwright dependencies
- `docker-compose.yml` - Full development environment with all services
- `docker-compose.test.yml` - Isolated test environment
- `.dockerignore` - Files excluded from Docker builds

## Common Workflows

### Development with Hot Reload

```bash
# Start services with volume mounts
docker compose up postgres redis

# Run API locally (uses Docker services for DB/Redis)
DATABASE_URL="postgresql://mcpmobile:mcpmobilepass@localhost:5432/mcpmobiletest" \
REDIS_URL="redis://:redispass@localhost:6379" \
npm run dev:api
```

### Running Tests in Isolation

```bash
# Use test compose file for isolated test environment
docker compose -f docker-compose.test.yml up --abort-on-container-exit --build

# View test results
docker compose -f docker-compose.test.yml logs test-runner
```

### Database Migrations in Docker

```bash
# Run Prisma migrations
docker compose exec postgres psql -U mcpmobile -d mcpmobiletest

# Or from the API container
docker compose exec api npx prisma migrate deploy
```

### Connecting to Services

```bash
# PostgreSQL CLI
docker compose exec postgres psql -U mcpmobile -d mcpmobiletest

# Redis CLI
docker compose exec redis redis-cli -a redispass
```

## Production Deployment

Build production images:

```bash
# Build API image
docker build -t mcp-mobile-test-api:latest .

# Run with production configuration
docker run -d \
  --name mcp-api \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e REDIS_URL="redis://..." \
  mcp-mobile-test-api:latest
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker compose logs [service-name]

# Check health status
docker compose ps
```

### Database Connection Issues

```bash
# Verify PostgreSQL is accepting connections
docker compose exec postgres pg_isready -U mcpmobile

# Check database exists
docker compose exec postgres psql -U mcpmobile -l
```

### Test Failures

```bash
# Run tests with verbose output
docker compose -f docker-compose.test.yml run --rm test-runner npm run test

# Keep containers running for inspection
docker compose -f docker-compose.test.yml up test-runner
```

### Clean Reset

```bash
# Remove all containers, volumes, and images
docker compose down -v --rmi all --remove-orphans
```

## CI/CD Integration

Example GitHub Actions workflow:

```yaml
name: Docker Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run tests in Docker
        run: docker compose -f docker-compose.test.yml up --abort-on-container-exit
```
