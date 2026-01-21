# 📦 unit-verification.test.ts

> **File**: `tests/artifact-capture/unit-verification.test.ts`
> **Type**: artifact
> **Tests**: 10
> **Generated**: 2026-01-20T21:45:48.098Z

---

## Artifact Capture Service - Unit Tests

## Tests

### ✅ should create artifact capture service with default config

**Test ID**: `tests/artifact-capture/unit-verification.test-should-create-artifact-capture-service-with-default-config`  
**Type**: artifact  
**Location**: [unit-verification.test](unit-verification.test:L31)  

**Test Steps**:

- [assertion] Assert config.baseDir equals 'artifacts'
- [assertion] Assert config.captureScreenshotOnFailure equals true
- [assertion] Assert config.captureDeviceLogs equals true
- [assertion] Assert config.capturePerformanceMetrics equals true

### ✅ should create artifact capture service with custom config

**Test ID**: `tests/artifact-capture/unit-verification.test-should-create-artifact-capture-service-with-custom-config`  
**Type**: artifact  
**Location**: [unit-verification.test](unit-verification.test:L42)  

### ✅ should create artifact base directory

**Test ID**: `tests/artifact-capture/unit-verification.test-should-create-artifact-base-directory`  
**Type**: artifact  
**Location**: [unit-verification.test](unit-verification.test:L60)  

### ✅ should capture and store a mock screenshot artifact

**Test ID**: `tests/artifact-capture/unit-verification.test-should-capture-and-store-a-mock-screenshot-artifact`  
**Type**: artifact  
**Location**: [unit-verification.test](unit-verification.test:L76)  

### ✅ should capture and store device logs

**Test ID**: `tests/artifact-capture/unit-verification.test-should-capture-and-store-device-logs`  
**Type**: artifact  
**Location**: [unit-verification.test](unit-verification.test:L107)  

### ✅ should capture and store performance metrics

**Test ID**: `tests/artifact-capture/unit-verification.test-should-capture-and-store-performance-metrics`  
**Type**: artifact  
**Location**: [unit-verification.test](unit-verification.test:L150)  

### ✅ should provide artifact summary for test run

**Test ID**: `tests/artifact-capture/unit-verification.test-should-provide-artifact-summary-for-test-run`  
**Type**: artifact  
**Location**: [unit-verification.test](unit-verification.test:L202)  

### ✅ should update configuration dynamically

**Test ID**: `tests/artifact-capture/unit-verification.test-should-update-configuration-dynamically`  
**Type**: artifact  
**Location**: [unit-verification.test](unit-verification.test:L229)  

### ✅ should cleanup artifacts for test run

**Test ID**: `tests/artifact-capture/unit-verification.test-should-cleanup-artifacts-for-test-run`  
**Type**: artifact  
**Location**: [unit-verification.test](unit-verification.test:L248)  

### ✅ should export ArtifactCaptureType enum

**Test ID**: `tests/artifact-capture/unit-verification.test-should-export-artifactcapturetype-enum`  
**Type**: artifact  
**Location**: [unit-verification.test](unit-verification.test:L271)  

**Test Steps**:

- [assertion] Assert ArtifactCaptureType.SCREENSHOT equals 'screenshot'
- [assertion] Assert ArtifactCaptureType.VIDEO equals 'video'
- [assertion] Assert ArtifactCaptureType.TRACE equals 'trace'
- [assertion] Assert ArtifactCaptureType.HAR equals 'har'
- [assertion] Assert ArtifactCaptureType.DEVICE_LOGS equals 'device_logs'
- [assertion] Assert ArtifactCaptureType.PERFORMANCE_METRICS equals 'performance_metrics'
- [assertion] Assert ArtifactCaptureType.NETWORK_LOGS equals 'network_logs'
- [assertion] Assert ArtifactCaptureType.CONSOLE_LOGS equals 'console_logs'
