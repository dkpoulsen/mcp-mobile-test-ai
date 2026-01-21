# 🌐 test-suites.spec.ts

> **File**: `tests/api/test-suites.spec.ts`
> **Type**: api
> **Tests**: 14
> **Generated**: 2026-01-20T21:45:48.098Z

---

## Test Suites API

## GET /api/test-suites

### ✅ should return empty array when no suites exist

**Test ID**: `tests/api/test-suites.spec-should-return-empty-array-when-no-suites-exist`  
**Type**: api  
**Location**: [test-suites.spec](test-suites.spec:L26)  

**Test Steps**:

- [api] Make GET request to /api/test-suites
- [assertion] Assert result.data.length equals 0
- [assertion] Assert result.pagination.total equals 0

## GET /api/test-suites/:id

### ✅ should return 404 for non-existent suite

**Test ID**: `tests/api/test-suites.spec-should-return-404-for-non-existent-suite`  
**Type**: api  
**Location**: [test-suites.spec](test-suites.spec:L101)  

**Test Steps**:

- [api] Make GET request to /api/test-suites/non-existent-id
- [assertion] Assert response.status equals 404

## POST /api/test-suites

### ✅ should create a new test suite

**Test ID**: `tests/api/test-suites.spec-should-create-a-new-test-suite`  
**Type**: api  
**Location**: [test-suites.spec](test-suites.spec:L157)  

**Test Steps**:

- [api] Make POST request to /api/test-suites

## PATCH /api/test-suites/:id

### ✅ should update test suite description

**Test ID**: `tests/api/test-suites.spec-should-update-test-suite-description`  
**Type**: api  
**Location**: [test-suites.spec](test-suites.spec:L201)  

## DELETE /api/test-suites/:id

### ✅ should delete a test suite

**Test ID**: `tests/api/test-suites.spec-should-delete-a-test-suite`  
**Type**: api  
**Location**: [test-suites.spec](test-suites.spec:L241)  

**Test Steps**:

- [assertion] Assert response.status equals 204
- [api] Make GET request to /api/test-suites/${suite.id}
- [assertion] Assert getResponse.status equals 404

## GET /api/test-suites/stats/summary

### ✅ should return test suite statistics

**Test ID**: `tests/api/test-suites.spec-should-return-test-suite-statistics`  
**Type**: api  
**Location**: [test-suites.spec](test-suites.spec:L257)  

**Test Steps**:

- [api] Make GET request to /api/test-suites/stats/summary
- [assertion] Assert data.total equals 3
- [assertion] Assert data.withTags equals 2

## Tests

### ✅ should return list of test suites

**Test ID**: `tests/api/test-suites.spec-should-return-list-of-test-suites`  
**Type**: api  
**Location**: [test-suites.spec](test-suites.spec:L38)  

**Test Steps**:

- [api] Make GET request to /api/test-suites
- [assertion] Assert result.data.length equals 2
- [assertion] Assert result.pagination.total equals 2

### ✅ should support pagination

**Test ID**: `tests/api/test-suites.spec-should-support-pagination`  
**Type**: api  
**Location**: [test-suites.spec](test-suites.spec:L54)  

**Test Steps**:

- [api] Make GET request to /api/test-suites?skip=2&take=2
- [assertion] Assert result.data.length equals 2
- [assertion] Assert result.pagination.skip equals 2
- [assertion] Assert result.pagination.take equals 2
- [assertion] Assert result.pagination.total equals 5
- [assertion] Assert result.pagination.totalPages equals 3

### ✅ should filter by tags

**Test ID**: `tests/api/test-suites.spec-should-filter-by-tags`  
**Type**: api  
**Location**: [test-suites.spec](test-suites.spec:L74)  

### ✅ should return a single test suite

**Test ID**: `tests/api/test-suites.spec-should-return-a-single-test-suite`  
**Type**: api  
**Location**: [test-suites.spec](test-suites.spec:L107)  

### ✅ should include test cases and test runs

**Test ID**: `tests/api/test-suites.spec-should-include-test-cases-and-test-runs`  
**Type**: api  
**Location**: [test-suites.spec](test-suites.spec:L130)  

### ✅ should return 400 when name is missing

**Test ID**: `tests/api/test-suites.spec-should-return-400-when-name-is-missing`  
**Type**: api  
**Location**: [test-suites.spec](test-suites.spec:L176)  

**Test Steps**:

- [api] Make POST request to /api/test-suites

### ✅ should create suite with empty tags

**Test ID**: `tests/api/test-suites.spec-should-create-suite-with-empty-tags`  
**Type**: api  
**Location**: [test-suites.spec](test-suites.spec:L186)  

**Test Steps**:

- [api] Make POST request to /api/test-suites

### ✅ should update test suite tags

**Test ID**: `tests/api/test-suites.spec-should-update-test-suite-tags`  
**Type**: api  
**Location**: [test-suites.spec](test-suites.spec:L221)  
