# 🔬 action-executor.test.ts

> **File**: `tests/unit/action-executor.test.ts`
> **Type**: unit
> **Tests**: 30
> **Generated**: 2026-01-20T21:45:48.099Z

---

## Action Executor Service

## ActionExecutor

### ✅ should create an executor instance

**Test ID**: `tests/unit/action-executor.test-should-create-an-executor-instance`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L245)  

**Test Steps**:

- [assertion] Assert executor is truthy
- [assertion] Assert executor.getActionCount() equals 0

## WaitHandler

### ✅ should create a wait handler

**Test ID**: `tests/unit/action-executor.test-should-create-a-wait-handler`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L499)  

**Test Steps**:

- [assertion] Assert handler is truthy

## ScreenshotCapture

### ✅ should create a screenshot capture instance

**Test ID**: `tests/unit/action-executor.test-should-create-a-screenshot-capture-instance`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L586)  

**Test Steps**:

- [assertion] Assert capture is truthy

## ActionExecutorError

### ✅ should create action executor error

**Test ID**: `tests/unit/action-executor.test-should-create-action-executor-error`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L645)  

## Tests

### ✅ should execute a tap action successfully

**Test ID**: `tests/unit/action-executor.test-should-execute-a-tap-action-successfully`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L251)  

**Test Steps**:

- [assertion] Assert result.success equals true
- [assertion] Assert result.action.type equals ActionType.TAP
- [assertion] Assert result.retries equals 0
- [assertion] Assert result.duration > 0 is truthy

### ✅ should execute an input action successfully

**Test ID**: `tests/unit/action-executor.test-should-execute-an-input-action-successfully`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L267)  

**Test Steps**:

- [assertion] Assert result.success equals true
- [assertion] Assert result.data?.input equals true
- [assertion] Assert result.data?.text equals 'Hello World'
- [assertion] Assert result.data?.cleared equals true

### ✅ should execute a clear action successfully

**Test ID**: `tests/unit/action-executor.test-should-execute-a-clear-action-successfully`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L286)  

**Test Steps**:

- [assertion] Assert result.success equals true
- [assertion] Assert result.data?.cleared equals true

### ✅ should execute a swipe action successfully

**Test ID**: `tests/unit/action-executor.test-should-execute-a-swipe-action-successfully`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L299)  

### ✅ should execute a scroll action successfully

**Test ID**: `tests/unit/action-executor.test-should-execute-a-scroll-action-successfully`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L328)  

**Test Steps**:

- [assertion] Assert result.success equals true
- [assertion] Assert result.data?.scrolled equals true
- [assertion] Assert result.data?.direction equals SwipeDirection.DOWN

### ✅ should execute a long press action successfully

**Test ID**: `tests/unit/action-executor.test-should-execute-a-long-press-action-successfully`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L345)  

**Test Steps**:

- [assertion] Assert result.success equals true
- [assertion] Assert result.data?.longPressed equals true
- [assertion] Assert result.data?.duration equals 100

### ✅ should execute a toggle action successfully

**Test ID**: `tests/unit/action-executor.test-should-execute-a-toggle-action-successfully`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L362)  

**Test Steps**:

- [assertion] Assert result.success equals true
- [assertion] Assert result.data?.toggled equals true
- [assertion] Assert result.data?.previousState equals false

### ✅ should execute go back action successfully

**Test ID**: `tests/unit/action-executor.test-should-execute-go-back-action-successfully`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L379)  

**Test Steps**:

- [assertion] Assert result.success equals true
- [assertion] Assert result.data?.navigatedBack equals true

### ✅ should execute hide keyboard action successfully

**Test ID**: `tests/unit/action-executor.test-should-execute-hide-keyboard-action-successfully`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L391)  

**Test Steps**:

- [assertion] Assert result.success equals true
- [assertion] Assert result.data?.keyboardHidden equals true

### ✅ should execute a wait action with duration

**Test ID**: `tests/unit/action-executor.test-should-execute-a-wait-action-with-duration`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L403)  

**Test Steps**:

- [assertion] Assert result.success equals true
- [assertion] Assert duration >= 50 is truthy

### ✅ should skip an action marked with skip: true

**Test ID**: `tests/unit/action-executor.test-should-skip-an-action-marked-with-skip:-true`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L420)  

**Test Steps**:

- [assertion] Assert result.success equals true
- [assertion] Assert result.data?.skipped equals true
- [assertion] Assert result.duration equals 0

### ✅ should handle element not found error

**Test ID**: `tests/unit/action-executor.test-should-handle-element-not-found-error`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L435)  

**Test Steps**:

- [assertion] Assert result.success equals false
- [assertion] Assert result.error is truthy
- [assertion] Assert result.retries > 0 is truthy

### ✅ should execute batch actions

**Test ID**: `tests/unit/action-executor.test-should-execute-batch-actions`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L449)  

**Test Steps**:

- [assertion] Assert result.total equals 3
- [assertion] Assert result.successCount equals 3
- [assertion] Assert result.failureCount equals 0
- [assertion] Assert result.results.length equals 3

### ✅ should handle batch with failures

**Test ID**: `tests/unit/action-executor.test-should-handle-batch-with-failures`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L465)  

**Test Steps**:

- [assertion] Assert result.total equals 3
- [assertion] Assert result.successCount equals 2
- [assertion] Assert result.failureCount equals 1

### ✅ should update configuration

**Test ID**: `tests/unit/action-executor.test-should-update-configuration`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L480)  

### ✅ should perform implicit wait for existing element

**Test ID**: `tests/unit/action-executor.test-should-perform-implicit-wait-for-existing-element`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L504)  

**Test Steps**:

- [assertion] Assert result.satisfied equals true
- [assertion] Assert result.data is truthy

### ✅ should timeout on implicit wait for non-existent element

**Test ID**: `tests/unit/action-executor.test-should-timeout-on-implicit-wait-for-non-existent-element`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L512)  

**Test Steps**:

- [assertion] Assert result.satisfied equals false
- [assertion] Assert result.error is truthy

### ✅ should wait for element to be visible

**Test ID**: `tests/unit/action-executor.test-should-wait-for-element-to-be-visible`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L520)  

**Test Steps**:

- [assertion] Assert result.satisfied equals true

### ✅ should wait for element to be enabled

**Test ID**: `tests/unit/action-executor.test-should-wait-for-element-to-be-enabled`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L530)  

**Test Steps**:

- [assertion] Assert result.satisfied equals true

### ✅ should wait for text content

**Test ID**: `tests/unit/action-executor.test-should-wait-for-text-content`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L540)  

**Test Steps**:

- [assertion] Assert result.satisfied equals true

### ✅ should perform explicit wait with custom condition

**Test ID**: `tests/unit/action-executor.test-should-perform-explicit-wait-with-custom-condition`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L550)  

### ✅ should timeout on explicit wait

**Test ID**: `tests/unit/action-executor.test-should-timeout-on-explicit-wait`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L569)  

### ✅ should capture before screenshot

**Test ID**: `tests/unit/action-executor.test-should-capture-before-screenshot`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L591)  

**Test Steps**:

- [assertion] Assert screenshot.phase equals 'before'
- [assertion] Assert screenshot.path is truthy
- [assertion] Assert screenshot.timestamp is truthy

### ✅ should capture after screenshot

**Test ID**: `tests/unit/action-executor.test-should-capture-after-screenshot`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L605)  

**Test Steps**:

- [assertion] Assert screenshot.phase equals 'after'
- [assertion] Assert screenshot.path is truthy

### ✅ should capture screenshots around an action

**Test ID**: `tests/unit/action-executor.test-should-capture-screenshots-around-an-action`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L618)  

### ✅ should track screenshot count

**Test ID**: `tests/unit/action-executor.test-should-track-screenshot-count`  
**Type**: unit  
**Location**: [action-executor.test](action-executor.test:L634)  

**Test Steps**:

- [assertion] Assert capture.getCount() equals 0
- [assertion] Assert capture.getCount() equals 0
