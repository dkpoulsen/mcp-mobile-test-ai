# 🌐 health.spec.ts

> **File**: `tests/api/health.spec.ts`
> **Type**: api
> **Tests**: 4
> **Generated**: 2026-01-20T21:45:48.097Z

---

## Health API

## GET /health

### ✅ should return health status

**Test ID**: `tests/api/health.spec-should-return-health-status`  
**Type**: api  
**Location**: [health.spec](health.spec:L17)  

**Test Steps**:

- [api] Make GET request to /health
- [assertion] Assert response.status equals 200
- [assertion] Assert body.status equals 'ok'
- [assertion] Assert body.timestamp is truthy
- [assertion] Assert body.database === 'connected' || body.database === 'disconnected' is truthy

## GET /health/ready

### ✅ should return ready status when database is connected

**Test ID**: `tests/api/health.spec-should-return-ready-status-when-database-is-connected`  
**Type**: api  
**Location**: [health.spec](health.spec:L36)  

**Test Steps**:

- [api] Make GET request to /health/ready
- [assertion] Assert response.status === 200 || response.status === 503 is truthy
- [assertion] Assert body.timestamp is truthy
- [assertion] Assert body.status equals 'ready'
- [assertion] Assert body.status equals 'not ready'

## GET /health/live

### ✅ should return alive status

**Test ID**: `tests/api/health.spec-should-return-alive-status`  
**Type**: api  
**Location**: [health.spec](health.spec:L54)  

**Test Steps**:

- [api] Make GET request to /health/live
- [assertion] Assert response.status equals 200
- [assertion] Assert body.status equals 'alive'
- [assertion] Assert body.timestamp is truthy

## Tests

### ✅ should return JSON content type

**Test ID**: `tests/api/health.spec-should-return-json-content-type`  
**Type**: api  
**Location**: [health.spec](health.spec:L28)  

**Test Steps**:

- [api] Make GET request to /health
- [assertion] Assert response.headers.get('content-type') equals 'application/json; charset=utf-8'
