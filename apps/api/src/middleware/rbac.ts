import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { prisma } from '../lib/prisma';
import { OrgRole } from '@prisma/client';

export type Permission =
  | 'org:view'
  | 'staff:list'
  | 'staff:invite'
  | 'staff:update_role'
  | 'staff:remove'
  | 'camp:manage'
  | 'camp:attendance'
  | 'clinical:screen'
  | 'donation:record'
  | 'collection:manage'
  | 'component:derive'
  | 'unit:view'
  | 'unit:transition'
  | 'handover:create'
  | 'handover:dispatch'
  | 'handover:receive'
  | 'handover:reconcile'
  | 'handover:view'
  | 'lab:record'
  | 'lab:verify'
  | 'clinical:release'
  | 'storage:manage'
  | 'inventory:view'
  | 'disposition:record'
  | 'issue:authorise'
  | 'issue:dispatch'
  | 'facility:receive'
  | 'facility:discrepancy'
  | 'transfusion:record'
  | 'audit:read'
  | 'operational:read'
  | 'operational:write';

export const ROLE_PERMISSIONS: Record<OrgRole, Permission[]> = {
  ORG_ADMIN: [
    'org:view',
    'staff:list',
    'staff:invite',
    'staff:update_role',
    'staff:remove',
    'camp:manage',
    'camp:attendance',
    'clinical:screen',
    'donation:record',
    'collection:manage',
    'component:derive',
    'unit:view',
    'unit:transition',
    'handover:create',
    'handover:dispatch',
    'handover:receive',
    'handover:reconcile',
    'handover:view',
    'lab:record',
    // NOTE: 'clinical:release', 'lab:verify', and 'transfusion:record' are intentionally OMITTED for ORG_ADMIN.
    // In accordance with NBTC and drug safety guidelines, clinical release, lab verification,
    // and transfusion documentation strictly require a designated CLINICAL_STAFF member.
    'storage:manage',
    'inventory:view',
    'disposition:record',
    'issue:authorise',
    'issue:dispatch',
    'facility:receive',
    'facility:discrepancy',
    'audit:read',
    'operational:read',
    'operational:write',
  ],
  INVENTORY_STAFF: [
    'org:view',
    'staff:list',
    'camp:attendance',
    'component:derive',
    'unit:view',
    'unit:transition',
    'handover:receive',
    'handover:reconcile',
    'handover:view',
    'lab:record',
    'storage:manage',
    'inventory:view',
    'disposition:record',
    'issue:dispatch',
    'facility:receive',
    'facility:discrepancy',
    'operational:read',
    'operational:write',
  ],
  CLINICAL_STAFF: [
    'org:view',
    'staff:list',
    'camp:attendance',
    'clinical:screen',
    'donation:record',
    'component:derive',
    'unit:view',
    'handover:view',
    'lab:record',
    'lab:verify',
    'clinical:release',
    'storage:manage',
    'inventory:view',
    'disposition:record',
    'issue:authorise',
    'facility:receive',
    'facility:discrepancy',
    'transfusion:record',
    'operational:read',
    'operational:write',
  ],
  COLLECTION_STAFF: [
    'org:view',
    'camp:manage',
    'camp:attendance',
    'donation:record',
    'collection:manage',
    'unit:view',
    'unit:transition',
    'handover:create',
    'handover:dispatch',
    'handover:view',
    'operational:read',
    'operational:write',
  ],
  AUDITOR: [
    'org:view',
    'staff:list',
    'unit:view',
    'handover:view',
    'inventory:view',
    'audit:read',
    'operational:read',
  ],
};

export interface OrgScopedRequest extends AuthenticatedRequest {
  orgMembership?: any;
  organisation?: any;
  orgPermissions?: Permission[];
}

/**
 * Ensures caller is an authenticated Platform Administrator (User.role === 'ADMIN').
 * Platform ADMIN has authority over system applications, but does NOT automatically
 * possess clinical authority within participating organisations.
 */
export function requirePlatformAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Authentication required.',
        code: 'UNAUTHORIZED',
      },
    });
  }

  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Platform administrator privileges required for this action.',
        code: 'FORBIDDEN_PLATFORM_ADMIN',
      },
    });
  }

  next();
}

/**
 * Reusable middleware to verify the caller's active membership in the target organisation
 * and enforce explicit role-based permissions server-side.
 * Strictly prevents cross-organisation resource tampering.
 */
export function requireOrgPermission(
  requiredPermissions: Permission[] = [],
  requiredRoles: OrgRole[] = []
) {
  return async (req: OrgScopedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: {
            message: 'Authentication required. Please sign in.',
            code: 'UNAUTHORIZED',
          },
        });
      }

      // Extract target organisation ID from path, body, or query
      const orgId =
        req.params.orgId ||
        req.params.id ||
        req.body?.organisationId ||
        (typeof req.query?.organisationId === 'string' ? req.query.organisationId : undefined);

      if (!orgId) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Target organisation identifier is required.',
            code: 'MISSING_ORGANISATION_ID',
          },
        });
      }

      const membership = await prisma.organisationMembership.findUnique({
        where: {
          userId_organisationId: {
            userId: req.user.id,
            organisationId: String(orgId),
          },
        },
        include: {
          organisation: true,
        },
      });

      if (!membership || !membership.isActive) {
        return res.status(403).json({
          success: false,
          error: {
            message: 'Access denied. You do not hold an active membership in this organisation.',
            code: 'FORBIDDEN_ORGANISATION_ACCESS',
          },
        });
      }

      if (membership.organisation.status !== 'VERIFIED') {
        return res.status(403).json({
          success: false,
          error: {
            message: 'This organisation is currently suspended or pending verification.',
            code: 'ORGANISATION_NOT_VERIFIED',
          },
        });
      }

      const userPermissions = ROLE_PERMISSIONS[membership.role] || [];

      // Check required roles if specified
      if (requiredRoles.length > 0 && !requiredRoles.includes(membership.role)) {
        return res.status(403).json({
          success: false,
          error: {
            message: `This action requires one of the following roles: ${requiredRoles.join(', ')}.`,
            code: 'INSUFFICIENT_ORGANISATION_ROLE',
          },
        });
      }

      // Check required permissions if specified
      const hasAllPermissions = requiredPermissions.every((perm) =>
        userPermissions.includes(perm)
      );

      if (!hasAllPermissions) {
        return res.status(403).json({
          success: false,
          error: {
            message: 'You do not have the necessary permissions within this organisation.',
            code: 'INSUFFICIENT_PERMISSIONS',
          },
        });
      }

      req.orgMembership = membership;
      req.organisation = membership.organisation;
      req.orgPermissions = userPermissions;
      next();
    } catch (err: any) {
      next(err);
    }
  };
}
