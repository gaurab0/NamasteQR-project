/**
 * Recursively strips undefined fields from an object or array.
 * Firestore setDoc and updateDoc reject any property with the value `undefined`.
 */
export function sanitizeFirestorePayload<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return null as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== undefined)
      .map((item) => sanitizeFirestorePayload(item)) as unknown as T;
  }

  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const cleanObj: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (val === undefined) {
        continue;
      }
      cleanObj[key] = sanitizeFirestorePayload(val);
    }
    return cleanObj as T;
  }

  return obj;
}
