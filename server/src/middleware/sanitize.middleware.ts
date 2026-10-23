import { Request, Response, NextFunction } from 'express';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function sanitizeValue(value: any, depth = 0): any {
  if (depth > 20) {
    return null;
  }
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    // Strip dangerous null bytes that could truncate strings in C/native libraries
    return value.replace(/\0/g, '');
  }

  if (value instanceof Date || value instanceof RegExp) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof value === 'object' && !Buffer.isBuffer(value)) {
    const cleaned: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(key)) {
        continue;
      }
      cleaned[key] = sanitizeValue(value[key], depth + 1);
    }
    return cleaned;
  }

  return value;
}

/**
 * Global input sanitization middleware:
 * Prevents prototype pollution, null-byte injection, and strips dangerous object keys
 * across req.body, req.query, and req.params.
 */
export function sanitizeInput(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    req.body = sanitizeValue(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeValue(req.query);
  }
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeValue(req.params);
  }
  next();
}
