# 👁️ visual-baseline-verification.test.ts

> **File**: `tests/visual-baseline/visual-baseline-verification.test.ts`
> **Type**: visual
> **Tests**: 15
> **Generated**: 2026-01-20T21:45:48.101Z

---

## Visual Baseline Service - Verification Tests

## Tests

### ✅ should create visual baseline service with default config

**Test ID**: `tests/visual-baseline/visual-baseline-verification.test-should-create-visual-baseline-service-with-default-config`  
**Type**: visual  
**Location**: [visual-baseline-verification.test](visual-baseline-verification.test:L96)  

**Test Steps**:

- [assertion] Assert config.baseDir equals 'visual-baselines'
- [assertion] Assert config.includeDeviceMetadata equals true
- [assertion] Assert config.defaultScreenshotType equals 'png'

### ✅ should create visual baseline service with custom config

**Test ID**: `tests/visual-baseline/visual-baseline-verification.test-should-create-visual-baseline-service-with-custom-config`  
**Type**: visual  
**Location**: [visual-baseline-verification.test](visual-baseline-verification.test:L107)  

### ✅ should capture visual baseline screenshot

**Test ID**: `tests/visual-baseline/visual-baseline-verification.test-should-capture-visual-baseline-screenshot`  
**Type**: visual  
**Location**: [visual-baseline-verification.test](visual-baseline-verification.test:L127)  

### ✅ should capture baseline with metadata

**Test ID**: `tests/visual-baseline/visual-baseline-verification.test-should-capture-baseline-with-metadata`  
**Type**: visual  
**Location**: [visual-baseline-verification.test](visual-baseline-verification.test:L145)  

### ✅ should include file size and dimensions in baseline

**Test ID**: `tests/visual-baseline/visual-baseline-verification.test-should-include-file-size-and-dimensions-in-baseline`  
**Type**: visual  
**Location**: [visual-baseline-verification.test](visual-baseline-verification.test:L176)  

### ✅ should store and retrieve baseline from cache

**Test ID**: `tests/visual-baseline/visual-baseline-verification.test-should-store-and-retrieve-baseline-from-cache`  
**Type**: visual  
**Location**: [visual-baseline-verification.test](visual-baseline-verification.test:L192)  

### ✅ should load baseline from file

**Test ID**: `tests/visual-baseline/visual-baseline-verification.test-should-load-baseline-from-file`  
**Type**: visual  
**Location**: [visual-baseline-verification.test](visual-baseline-verification.test:L208)  

### ✅ should find baselines by screen name

**Test ID**: `tests/visual-baseline/visual-baseline-verification.test-should-find-baselines-by-screen-name`  
**Type**: visual  
**Location**: [visual-baseline-verification.test](visual-baseline-verification.test:L230)  

### ✅ should list all baselines

**Test ID**: `tests/visual-baseline/visual-baseline-verification.test-should-list-all-baselines`  
**Type**: visual  
**Location**: [visual-baseline-verification.test](visual-baseline-verification.test:L256)  

### ✅ should update configuration dynamically

**Test ID**: `tests/visual-baseline/visual-baseline-verification.test-should-update-configuration-dynamically`  
**Type**: visual  
**Location**: [visual-baseline-verification.test](visual-baseline-verification.test:L276)  

**Test Steps**:

- [assertion] Assert visualBaselineService.getConfig().includeDeviceMetadata equals true

### ✅ should return undefined for non-existent baseline

**Test ID**: `tests/visual-baseline/visual-baseline-verification.test-should-return-undefined-for-non-existent-baseline`  
**Type**: visual  
**Location**: [visual-baseline-verification.test](visual-baseline-verification.test:L288)  

**Test Steps**:

- [assertion] Assert result equals undefined

### ✅ should return undefined for non-existent file

**Test ID**: `tests/visual-baseline/visual-baseline-verification.test-should-return-undefined-for-non-existent-file`  
**Type**: visual  
**Location**: [visual-baseline-verification.test](visual-baseline-verification.test:L293)  

**Test Steps**:

- [assertion] Assert result equals undefined

### ✅ should create baseline directory if it does not exist

**Test ID**: `tests/visual-baseline/visual-baseline-verification.test-should-create-baseline-directory-if-it-does-not-exist`  
**Type**: visual  
**Location**: [visual-baseline-verification.test](visual-baseline-verification.test:L298)  

### ✅ should sanitize screen names for filenames

**Test ID**: `tests/visual-baseline/visual-baseline-verification.test-should-sanitize-screen-names-for-filenames`  
**Type**: visual  
**Location**: [visual-baseline-verification.test](visual-baseline-verification.test:L311)  

### ✅ should use custom path when provided

**Test ID**: `tests/visual-baseline/visual-baseline-verification.test-should-use-custom-path-when-provided`  
**Type**: visual  
**Location**: [visual-baseline-verification.test](visual-baseline-verification.test:L324)  
