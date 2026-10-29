import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { db } from '../services/db.service';
import { AuthSessionUser, BusinessType, User, UserRole } from '../types';
import type { AppResource } from '../types/rbac.types';
import {
  canAccessResource,
  describeResourceRequirement,
  isBusinessOwnerRole,
  isOwnerSubject,
  isManagerRole,
  type AccessKind,
} from '../services/tabAccess';

export interface AuthenticatedRequest extends Request {
  user?: AuthSessionUser;
}

export function buildSessionBusiness(business: any, fallbackBizId: string) {
  return {
    id: business?.id || fallbackBizId,
    name: business?.name || 'Business',
    type: business?.business_type || 'RESTAURANT',
    status: business?.status || 'ACTIVE',
    tagline: business?.tagline || '',
    location: business?.location || '',
    address: business?.address || '',
    kitchen_hours: business?.kitchen_hours || '',
    phone: business?.phone || '',
    menu_theme_config: business?.menu_theme_config,
    date_format_nav: business?.date_format_nav || 'ENGLISH',
    date_format_billing: business?.date_format_billing || 'ENGLISH',
  };
}

export function generateToken(payload: {
  userId: string;
  role: UserRole;
  email?: string;
  businessId?: string;
  businessName?: string;
  businessType?: BusinessType;
  [key: string]: any;
}): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: `${config.sessionExpiryDays}d`,
  });
}

export function setAuthCookie(res: Response, token: string, rememberMe = false) {
  const maxAge = (rememberMe ? 30 : config.sessionExpiryDays) * 24 * 60 * 60 * 1000;
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge,
    path: '/',
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
  });
}

/**
 * PIN staff-session overlay: a business owner's JWT may carry an `x-staff-session` header naming a
 * staff member of the same business. Permissions are then evaluated for that staff member
 * (`acting_as`). This can only NARROW access: it is ignored for non-owner JWT users, and the
 * staff identity/tabs always come from the database, never from client-sent values.
 */
async function resolveActingAs(
  req: AuthenticatedRequest,
  ownerUser: User
): Promise<AuthSessionUser['acting_as'] | undefined> {
  if (!isBusinessOwnerRole(ownerUser.role)) return undefined;
  const headerValue = req.headers['x-staff-session'];
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!raw) return undefined;

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const staffId = parsed?.id || parsed?.userId;
  const staffEmail = parsed?.email || (req.headers['x-staff-email'] as string | undefined);

  let staff = staffId ? await db.findUserById(String(staffId)) : null;
  if (!staff && staffEmail) staff = await db.findUserByEmail(String(staffEmail));
  if (!staff || staff.id === ownerUser.id) return undefined;
  if (staff.business_id !== ownerUser.business_id) return undefined;

  const allowed_tabs = staff.status === 'ACTIVE' ? await db.ensureAllowedTabsPersisted(staff) : [];
  return { id: staff.id, email: staff.email, role: staff.role, allowed_tabs };
}

export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const token = 
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined) ||
      (req.headers['x-auth-token'] as string) ||
      req.cookies?.auth_token;

    if (token) {
      try {
        const decoded = jwt.verify(token, config.jwtSecret) as {
          userId: string;
          role: UserRole;
          email?: string;
          businessId?: string;
          businessName?: string;
          businessType?: BusinessType;
        };
        let user = await db.findUserById(decoded.userId);
        if (!user && decoded.email) {
          user = await db.findUserByEmail(decoded.email);
        }

        // If the token was signed with our secret, it is authentic.
        // If the database was recently remixed or user record was cleared, restore/ensure it!
        if (!user) {
          const targetBizId = decoded.businessId || 'maya-forest-resort';
          const targetBizName = decoded.businessName;
          const targetBizType = decoded.businessType;
          const business = await db.ensureBusiness(targetBizId, targetBizName, targetBizType);
          
          user = await db.ensureUser({
            id: decoded.userId,
            business_id: business.id,
            email: decoded.email || `owner@${business.id}.app`,
            role: decoded.role || (business.business_type === 'HOTEL' ? 'HOTEL_OWNER' : 'RESTAURANT_OWNER'),
          });
        }

        if (user) {
          if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
            clearAuthCookie(res);
            return res.status(403).json({
              success: false,
              error: {
                code: 'ACCOUNT_SUSPENDED',
                message: 'Your account is suspended or inactive. Please contact support.',
              },
            });
          }

          let business = await db.findBusinessById(user.business_id);
          if (!business) {
            business = await db.ensureBusiness(user.business_id);
          }
          const phone = await db.findPhoneByUserId(user.id);

          req.user = {
            id: user.id,
            email: user.email,
            name: user.name || (user.email ? user.email.split('@')[0] : 'User'),
            created_at: user.created_at,
            role: user.role,
            status: user.status,
            allowed_tabs: await db.ensureAllowedTabsPersisted(user),
            acting_as: await resolveActingAs(req, user),
            custom_permissions: user.custom_permissions,
            business: buildSessionBusiness(business, user.business_id),
            phone: {
              countryCode: phone?.phone_country_code || '+977',
              number: phone?.phone_number || '9800000000',
              e164: phone?.phone_e164 || '+9779800000000',
              isVerified: phone?.is_verified ?? true,
            },
          };

          return next();
        }
      } catch (err) {
        // Token was invalid or expired
      }
    }

    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Please log in to continue.',
      },
    });
  } catch (err: any) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Your session has expired or is invalid. Please log in again.',
      },
    });
  }
}

export async function optionalAuthenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.auth_token || 
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined) ||
      (req.headers['x-auth-token'] as string);

    if (token) {
      try {
        const decoded = jwt.verify(token, config.jwtSecret) as {
          userId: string;
          role: UserRole;
          email?: string;
          businessId?: string;
          businessName?: string;
          businessType?: BusinessType;
        };
        let user = await db.findUserById(decoded.userId);
        if (!user && decoded.email) {
          user = await db.findUserByEmail(decoded.email);
        }

        if (!user) {
          const targetBizId = decoded.businessId || 'maya-forest-resort';
          const targetBizName = decoded.businessName;
          const targetBizType = decoded.businessType;
          const business = await db.ensureBusiness(targetBizId, targetBizName, targetBizType);
          
          user = await db.ensureUser({
            id: decoded.userId,
            business_id: business.id,
            email: decoded.email || `owner@${business.id}.app`,
            role: decoded.role || (business.business_type === 'HOTEL' ? 'HOTEL_OWNER' : 'RESTAURANT_OWNER'),
          });
        }

        if (user && user.status !== 'SUSPENDED' && user.status !== 'DEACTIVATED') {
          let business = await db.findBusinessById(user.business_id);
          if (!business) {
            business = await db.ensureBusiness(user.business_id);
          }
          const phone = await db.findPhoneByUserId(user.id);

          req.user = {
            id: user.id,
            email: user.email,
            name: user.name || (user.email ? user.email.split('@')[0] : 'User'),
            created_at: user.created_at,
            role: user.role,
            status: user.status,
            allowed_tabs: await db.ensureAllowedTabsPersisted(user),
            acting_as: await resolveActingAs(req, user),
            custom_permissions: user.custom_permissions,
            business: buildSessionBusiness(business, user.business_id),
            phone: {
              countryCode: phone?.phone_country_code || '+977',
              number: phone?.phone_number || '9800000000',
              e164: phone?.phone_e164 || '+9779800000000',
              isVerified: phone?.is_verified ?? true,
            },
          };
          return next();
        }
      } catch {
        // Fall through to unauthenticated next
      }
    }

    return next();
  } catch {
    return next();
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to access this resource.',
        },
      });
    }

    next();
  };
}

/**
 * Tab-based guard: allows the request only if the authenticated account (or the staff profile it
 * is acting as) holds a tab that unlocks `resource` for the requested kind of access.
 * Pair with `authenticate` (401 when no user is present).
 */
export function requireResourceAccess(resource: AppResource | AppResource[], kind: AccessKind) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    const resources = Array.isArray(resource) ? resource : [resource];
    const hasAccess = resources.some((r) => canAccessResource(req.user, r, kind));

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'TAB_ACCESS_DENIED',
          message: `Permission denied: this action ${describeResourceRequirement(resources[0], kind)}.`,
        },
      });
    }

    next();
  };
}

/**
 * Ensures authenticated user is a business owner or holds a manager role
 */
export function requireOwnerOrManager(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }

  const effectiveRole = req.user.acting_as ? req.user.acting_as.role : req.user.role;
  if (!isOwnerSubject(req.user) && !isManagerRole(effectiveRole)) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Permission denied: Requires owner or manager authorization.',
      },
    });
  }

  next();
}

/**
 * Tenant Isolation Guard:
 * Verifies that the authenticated user is authorized to access data for targetBusinessId.
 * An authenticated user is permitted if:
 * 1. targetBusinessId matches their own business context (user.business.id)
 * 2. The user is a super admin
 * 3. The user is a business owner or holds the 'franchise' tab, and targetBusinessId is a branch
 *    within their franchise network.
 * Unauthenticated requests (e.g., public customer QR dining) pass through.
 */
export async function assertBusinessAccess(user: AuthSessionUser | undefined, targetBusinessId: string): Promise<boolean> {
  if (!user) return true;

  if (user.business?.id === targetBusinessId) {
    return true;
  }

  if ((user.role as string) === 'SUPER_ADMIN' || (user.role as string) === 'ADMIN') {
    return true;
  }

  const isOwner = isBusinessOwnerRole(user.role);
  const hasFranchise = user.allowed_tabs?.includes('franchise');
  if (isOwner || hasFranchise) {
    const parentId = user.business?.id || '';
    const branches = await db.getBranchesForOwner(user.id, parentId);
    if (branches.some((b) => b.id === targetBusinessId)) {
      return true;
    }
  }

  return false;
}
