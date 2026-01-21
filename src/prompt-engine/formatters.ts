/**
 * Built-in formatters for prompt templates
 * Provides string, number, date, and array transformations
 */

import type { TemplateFilter, BuiltInFormatters } from './types.js';

/**
 * Convert value to string safely
 */
function toString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(String).join(', ');
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Convert value to array
 */
function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === null || value === undefined) {
    return [];
  }
  return [value];
}

/**
 * String formatters
 */
const uppercase: TemplateFilter = (value) => toString(value).toUpperCase();

const lowercase: TemplateFilter = (value) => toString(value).toLowerCase();

const capitalize: TemplateFilter = (value) => {
  const str = toString(value);
  if (str.length === 0) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

const title: TemplateFilter = (value) => {
  const str = toString(value);
  return str
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1) : ''))
    .join(' ');
};

const truncate: TemplateFilter = (value, length = 50) => {
  const str = toString(value);
  const len = typeof length === 'number' ? length : parseInt(String(length), 10) || 50;
  if (str.length <= len) return str;
  return str.slice(0, len - 3) + '...';
};

const trim: TemplateFilter = (value) => toString(value).trim();

const replace: TemplateFilter = (value, search, replacement) => {
  const str = toString(value);
  const searchStr = toString(search);
  const replacementStr = toString(replacement);
  return str.replace(new RegExp(searchStr, 'g'), replacementStr);
};

/**
 * Number formatters
 */
const number: TemplateFilter = (value) => {
  const num = typeof value === 'number' ? value : parseFloat(toString(value));
  if (isNaN(num)) return '0';
  return num.toLocaleString('en-US', { maximumFractionDigits: 3 });
};

const integer: TemplateFilter = (value) => {
  const num = typeof value === 'number' ? value : parseFloat(toString(value));
  if (isNaN(num)) return '0';
  return Math.floor(num).toLocaleString('en-US');
};

const decimal: TemplateFilter = (value, places = 2) => {
  const num = typeof value === 'number' ? value : parseFloat(toString(value));
  const precision = typeof places === 'number' ? places : 2;
  if (isNaN(num)) return '0';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
};

const currency: TemplateFilter = (value, symbol = '$') => {
  const num = typeof value === 'number' ? value : parseFloat(toString(value));
  if (isNaN(num)) return `${symbol}0.00`;
  return `${symbol}${num.toFixed(2)}`;
};

const percent: TemplateFilter = (value) => {
  const num = typeof value === 'number' ? value : parseFloat(toString(value));
  if (isNaN(num)) return '0%';
  return `${(num * 100).toFixed(1)}%`;
};

/**
 * JSON formatters
 */
const json: TemplateFilter = (value) => {
  try {
    return JSON.stringify(value);
  } catch {
    return toString(value);
  }
};

const prettyJson: TemplateFilter = (value, spaces = 2) => {
  try {
    const indentation = typeof spaces === 'number' ? spaces : 2;
    return JSON.stringify(value, null, indentation);
  } catch {
    return toString(value);
  }
};

/**
 * Conditional formatters
 */
const defaultValue: TemplateFilter = (value, defaultVal) => {
  if (value === null || value === undefined || value === '') {
    return toString(defaultVal);
  }
  return toString(value);
};

const ifFn: TemplateFilter = (condition, thenValue, elseValue = '') => {
  const conditionResult = Boolean(condition);
  // Handle case where thenValue contains a colon (e.g., "Yes:No" as single arg)
  if (typeof thenValue === 'string' && elseValue === '' && thenValue.includes(':')) {
    const parts = thenValue.split(':');
    return conditionResult ? toString(parts[0]) : toString(parts.slice(1).join(':'));
  }
  return conditionResult ? toString(thenValue) : toString(elseValue);
};

/**
 * Array formatters
 */
const join: TemplateFilter = (value, separator = ', ') => {
  const arr = toArray(value);
  const sep = toString(separator);
  return arr.map((v) => toString(v)).join(sep);
};

const first: TemplateFilter = (value) => {
  const arr = toArray(value);
  return arr.length > 0 ? toString(arr[0]) : '';
};

const last: TemplateFilter = (value) => {
  const arr = toArray(value);
  return arr.length > 0 ? toString(arr[arr.length - 1]) : '';
};

const length: TemplateFilter = (value) => {
  if (Array.isArray(value)) return String(value.length);
  if (typeof value === 'string') return String(value.length);
  if (typeof value === 'object' && value !== null) {
    return String(Object.keys(value).length);
  }
  return '1';
};

/**
 * Date formatters
 */
const date: TemplateFilter = (value, format = 'ISO') => {
  let dateObj: Date;

  if (value instanceof Date) {
    dateObj = value;
  } else if (typeof value === 'string' || typeof value === 'number') {
    dateObj = new Date(value);
  } else {
    return '';
  }

  if (isNaN(dateObj.getTime())) {
    return '';
  }

  const formatStr = toString(format).toUpperCase();

  switch (formatStr) {
    case 'ISO':
      return dateObj.toISOString();
    case 'DATE':
      return dateObj.toLocaleDateString();
    case 'TIME':
      return dateObj.toLocaleTimeString();
    case 'DATETIME':
      return dateObj.toLocaleString();
    case 'YEAR':
      return String(dateObj.getFullYear());
    case 'MONTH':
      return String(dateObj.getMonth() + 1).padStart(2, '0');
    case 'DAY':
      return String(dateObj.getDate()).padStart(2, '0');
    case 'HOURS':
      return String(dateObj.getHours()).padStart(2, '0');
    case 'MINUTES':
      return String(dateObj.getMinutes()).padStart(2, '0');
    case 'SECONDS':
      return String(dateObj.getSeconds()).padStart(2, '0');
    default:
      return dateObj.toISOString();
  }
};

const isoDate: TemplateFilter = (value) => {
  return date(value, 'ISO');
};

const relativeTime: TemplateFilter = (value) => {
  let dateObj: Date;

  if (value instanceof Date) {
    dateObj = value;
  } else if (typeof value === 'string' || typeof value === 'number') {
    dateObj = new Date(value);
  } else {
    return '';
  }

  if (isNaN(dateObj.getTime())) {
    return '';
  }

  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  const isFuture = diffMs < 0;

  if (isFuture) {
    if (Math.abs(diffSecs) < 60) return `in ${Math.abs(diffSecs)} seconds`;
    if (Math.abs(diffMins) < 60) return `in ${Math.abs(diffMins)} minutes`;
    if (Math.abs(diffHours) < 24) return `in ${Math.abs(diffHours)} hours`;
    return `in ${Math.abs(diffDays)} days`;
  }

  if (diffSecs < 60) return `${diffSecs} seconds ago`;
  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  return `${diffDays} days ago`;
};

/**
 * Built-in formatters registry
 */
export const builtInFormatters: BuiltInFormatters = {
  // String formatters
  uppercase,
  lowercase,
  capitalize,
  title,
  truncate,
  trim,
  replace,

  // Number formatters
  number,
  integer,
  decimal,
  currency,
  percent,

  // JSON formatters
  json,
  prettyJson,

  // Conditional formatters
  default: defaultValue,
  if: ifFn,

  // Array formatters
  join,
  first,
  last,
  length,

  // Date formatters
  date,
  isoDate,
  relativeTime,
};

/**
 * Get a formatter by name
 */
export function getFormatter(name: string): TemplateFilter | undefined {
  return builtInFormatters[name as keyof BuiltInFormatters];
}

/**
 * Check if a formatter exists
 */
export function hasFormatter(name: string): boolean {
  return name in builtInFormatters;
}

/**
 * Get all formatter names
 */
export function getFormatterNames(): string[] {
  return Object.keys(builtInFormatters);
}

/**
 * Create custom formatters registry with built-ins
 */
export function createFormattersRegistry(
  custom?: Record<string, TemplateFilter>
): Record<string, TemplateFilter> {
  return {
    ...builtInFormatters,
    ...custom,
  };
}
