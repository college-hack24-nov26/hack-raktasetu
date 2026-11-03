import { prisma } from '../lib/prisma';
import {
  ComponentUnitStatus,
  ComponentType,
  BloodGroup,
  ClinicalReleaseDecision,
} from '@prisma/client';

// ====================================================
// Phase 8: Patient Blood Availability Search Service
// ====================================================
// Distinguishes:
//   1. External eRaktKosh directory + availability snapshots
//   2. Verified organisation directory records
//   3. Authoritative inventory of individual component units in participating orgs
// Never implies that an external listing or inventory count guarantees
// clinical suitability or issuance.

export interface PatientSearchFilters {
  stateCode?: number;
  districtCode?: number;
  bloodGroup?: string;    // e.g. 'B_POS', 'A_NEG'
  componentType?: string; // e.g. 'PRBC', 'WHOLE_BLOOD', 'FRESH_FROZEN_PLASMA'
  hospitalCode?: string;  // Filter to specific participating blood bank
  source?: 'all' | 'participating' | 'external'; // Data source filter
  page?: number;
  limit?: number;
}

export interface SearchResultEntry {
  source: 'PARTICIPATING_ORGANISATION' | 'ERAKTKOSH_SNAPSHOT';
  organisation?: {
    id: string;
    name: string;
    orgCode: string;
    districtCode: number;
    districtName?: string | null;
    address?: string | null;
    phone?: string | null;
    type: string;
  };
  externalCentre?: {
    hospitalCode: string;
    hospitalName: string;
    address?: string | null;
    mobileNo?: string | null;
    hasValidContact: boolean;
  };
  availability: {
    availableCount: number;
    componentBreakdown: Record<string, number>;
    bloodGroupBreakdown: Record<string, number>;
    dataFreshness: 'live' | 'recent' | 'stale' | 'unknown';
    lastRefreshedAt: string | null;
    sourceEntryDate?: string | null;
    note: string;
  };
}

// Blood group enum to display mapping
const BLOOD_GROUP_DISPLAY: Record<string, string> = {
  A_POS: 'A+', A_NEG: 'A-',
  B_POS: 'B+', B_NEG: 'B-',
  AB_POS: 'AB+', AB_NEG: 'AB-',
  O_POS: 'O+', O_NEG: 'O-',
};

// Component type enum to display mapping
const COMPONENT_DISPLAY: Record<string, string> = {
  WHOLE_BLOOD: 'Whole Blood',
  PRBC: 'Packed Red Blood Cells',
  FRESH_FROZEN_PLASMA: 'Fresh Frozen Plasma',
  PLATELET_CONCENTRATE: 'Platelet Concentrate',
  CRYOPRECIPITATE: 'Cryoprecipitate',
  BUFFY_COAT: 'Buffy Coat',
};

// Map external component names to internal ComponentType enum values
const EXTERNAL_TO_INTERNAL_COMPONENT: Record<string, ComponentType> = {
  'Packed Red Blood Cells': 'PRBC',
  'Whole Blood': 'WHOLE_BLOOD',
  'Fresh Frozen Plasma': 'FRESH_FROZEN_PLASMA',
  'Platelet Concentrate': 'PLATELET_CONCENTRATE',
  'Cryoprecipitate': 'CRYOPRECIPITATE',
};

export class PatientSearchService {
  /**
   * Unified blood availability search.
   * Combines participating organisation authoritative inventory
   * with external eRaktKosh snapshots, clearly distinguishing sources.
   *
   * ELIGIBILITY RULES for participating org inventory:
   * - Component status must be AVAILABLE
   * - Must NOT be expired (expiresAt > now)
   * - Must NOT be under quarantine hold (isHold === false)
   * - Must NOT be in terminal states (ISSUED, DISCARDED, EXPIRED)
   * - Must have an authorised clinical release (RELEASED decision)
   * - Must belong to a VERIFIED organisation
   *
   * NEVER exposes: donor identity, internal unit IDs, lab-sensitive data
   */
  static async searchAvailability(filters: PatientSearchFilters): Promise<{
    results: SearchResultEntry[];
    meta: {
      totalResults: number;
      participatingOrgResults: number;
      externalSnapshotResults: number;
      searchCriteria: PatientSearchFilters;
      dataSourceNote: string;
    };
  }> {
    const now = new Date();
    const results: SearchResultEntry[] = [];

    const bloodGroupEnum = filters.bloodGroup as BloodGroup | undefined;
    const componentTypeEnum = filters.componentType as ComponentType | undefined;

    // ──────────────────────────────────────────
    // 1. PARTICIPATING ORGANISATIONS (Authoritative Inventory)
    // ──────────────────────────────────────────
    if (filters.source !== 'external') {
      const orgWhere: any = {
        status: 'VERIFIED',
      };
      if (filters.stateCode) orgWhere.stateCode = filters.stateCode;
      if (filters.districtCode) orgWhere.districtCode = filters.districtCode;

      const verifiedOrgs = await prisma.organisation.findMany({
        where: orgWhere,
        select: {
          id: true,
          name: true,
          orgCode: true,
          type: true,
          districtCode: true,
          districtName: true,
          address: true,
          phone: true,
        },
      });

      for (const org of verifiedOrgs) {
        // Query eligible components with strict filters
        const componentWhere: any = {
          organisationId: org.id,
          status: 'AVAILABLE' as ComponentUnitStatus,
          isHold: false,
          expiresAt: { gt: now }, // Not expired
        };

        if (bloodGroupEnum) {
          componentWhere.bloodGroup = bloodGroupEnum;
        }
        if (componentTypeEnum) {
          componentWhere.componentType = componentTypeEnum;
        }

        // Must have an authorised clinical RELEASED record
        componentWhere.clinicalReleases = {
          some: {
            decision: 'RELEASED' as ClinicalReleaseDecision,
          },
        };

        const eligibleComponents = await prisma.componentUnit.findMany({
          where: componentWhere,
          select: {
            componentType: true,
            bloodGroup: true,
            expiresAt: true,
            updatedAt: true,
          },
        });

        if (eligibleComponents.length === 0) continue;

        // Aggregate by component type and blood group without exposing unit details
        const componentBreakdown: Record<string, number> = {};
        const bloodGroupBreakdown: Record<string, number> = {};
        let latestUpdate: Date | null = null;

        for (const comp of eligibleComponents) {
          const compDisplay = COMPONENT_DISPLAY[comp.componentType] || comp.componentType;
          componentBreakdown[compDisplay] = (componentBreakdown[compDisplay] || 0) + 1;

          const bgDisplay = BLOOD_GROUP_DISPLAY[comp.bloodGroup] || comp.bloodGroup;
          bloodGroupBreakdown[bgDisplay] = (bloodGroupBreakdown[bgDisplay] || 0) + 1;

          if (!latestUpdate || comp.updatedAt > latestUpdate) {
            latestUpdate = comp.updatedAt;
          }
        }

        results.push({
          source: 'PARTICIPATING_ORGANISATION',
          organisation: {
            id: org.id,
            name: org.name,
            orgCode: org.orgCode,
            districtCode: org.districtCode,
            districtName: org.districtName,
            address: org.address,
            phone: org.phone,
            type: org.type,
          },
          availability: {
            availableCount: eligibleComponents.length,
            componentBreakdown,
            bloodGroupBreakdown,
            dataFreshness: 'live',
            lastRefreshedAt: latestUpdate?.toISOString() || now.toISOString(),
            note: 'Authoritative inventory from verified participating organisation. Availability does not guarantee clinical suitability or issuance. Contact the blood bank to confirm.',
          },
        });
      }
    }

    // ──────────────────────────────────────────
    // 2. EXTERNAL eRaktKosh SNAPSHOTS
    // ──────────────────────────────────────────
    if (filters.source !== 'participating') {
      const snapshotWhere: any = {};

      if (filters.districtCode || filters.stateCode) {
        snapshotWhere.bloodCentre = {};
        if (filters.districtCode) snapshotWhere.bloodCentre.districtCode = filters.districtCode;
        if (filters.stateCode) snapshotWhere.bloodCentre.stateCode = filters.stateCode;
      }

      if (bloodGroupEnum) {
        const bgDisplay = BLOOD_GROUP_DISPLAY[bloodGroupEnum];
        if (bgDisplay) {
          snapshotWhere.bloodGroup = { contains: bgDisplay, mode: 'insensitive' };
        }
      }

      if (componentTypeEnum) {
        const compName = COMPONENT_DISPLAY[componentTypeEnum];
        if (compName) {
          snapshotWhere.component = { contains: compName, mode: 'insensitive' };
        }
      }

      // Get the latest snapshot per hospital for each component
      const snapshots = await prisma.bloodAvailabilitySnapshot.findMany({
        where: snapshotWhere,
        include: {
          bloodCentre: {
            select: {
              hospitalCode: true,
              hospitalName: true,
              address: true,
              mobileNo: true,
              districtCode: true,
            },
          },
        },
        orderBy: { retrievedAt: 'desc' },
        distinct: ['hospitalCode'],
      });

      // Skip centres that are already represented by participating orgs
      const participatingHospitalCodes = new Set<string>();
      const verifiedOrgsWithCodes = await prisma.organisation.findMany({
        where: { status: 'VERIFIED', hospitalCode: { not: null } },
        select: { hospitalCode: true },
      });
      for (const org of verifiedOrgsWithCodes) {
        if (org.hospitalCode) participatingHospitalCodes.add(org.hospitalCode);
      }

      for (const snap of snapshots) {
        // Don't duplicate centres that are already in participating results
        if (participatingHospitalCodes.has(snap.hospitalCode)) continue;

        const contact = normalizeContactPhone(snap.bloodCentre?.mobileNo);
        const staleCutoffHours = 48;
        const isStale = snap.isStale || isDataStale(snap.sourceEntryDate, staleCutoffHours);

        let freshness: 'live' | 'recent' | 'stale' | 'unknown' = 'unknown';
        if (snap.sourceEntryDate) {
          freshness = isStale ? 'stale' : 'recent';
        }

        const componentBreakdown: Record<string, number> = {};
        const bloodGroupBreakdown: Record<string, number> = {};

        if (snap.reportedQuantity !== null && snap.reportedQuantity > 0) {
          componentBreakdown[snap.component] = snap.reportedQuantity;
          if (snap.bloodGroup) {
            bloodGroupBreakdown[snap.bloodGroup] = snap.reportedQuantity;
          }
        }

        results.push({
          source: 'ERAKTKOSH_SNAPSHOT',
          externalCentre: {
            hospitalCode: snap.hospitalCode,
            hospitalName: snap.bloodCentre?.hospitalName || `Centre ${snap.hospitalCode}`,
            address: snap.bloodCentre?.address || null,
            mobileNo: contact,
            hasValidContact: contact !== null,
          },
          availability: {
            availableCount: snap.reportedQuantity ?? 0,
            componentBreakdown,
            bloodGroupBreakdown,
            dataFreshness: freshness,
            lastRefreshedAt: snap.retrievedAt.toISOString(),
            sourceEntryDate: snap.sourceEntryDate?.toISOString() || null,
            note: isStale
              ? 'External data is stale. Reported availability may no longer be accurate. Contact the centre directly.'
              : snap.reportedQuantity === null
              ? 'External data is unavailable or unparseable. Contact the centre directly for current stock.'
              : 'Data from eRaktKosh external directory. Reported stock is not guaranteed. Contact the centre before travel.',
          },
        });
      }
    }

    // Sort: participating orgs first, then by available count descending
    results.sort((a, b) => {
      if (a.source !== b.source) {
        return a.source === 'PARTICIPATING_ORGANISATION' ? -1 : 1;
      }
      return b.availability.availableCount - a.availability.availableCount;
    });

    const participatingOrgResults = results.filter(r => r.source === 'PARTICIPATING_ORGANISATION').length;
    const externalSnapshotResults = results.filter(r => r.source === 'ERAKTKOSH_SNAPSHOT').length;

    return {
      results,
      meta: {
        totalResults: results.length,
        participatingOrgResults,
        externalSnapshotResults,
        searchCriteria: filters,
        dataSourceNote: participatingOrgResults > 0 && externalSnapshotResults > 0
          ? 'Results include both verified participating organisations with authoritative inventory and external eRaktKosh directory snapshots. Sources are clearly labelled.'
          : participatingOrgResults > 0
          ? 'Results are from verified participating organisations with authoritative inventory.'
          : externalSnapshotResults > 0
          ? 'Results are from external eRaktKosh directory snapshots. Contact centres directly to confirm availability.'
          : 'No results found matching your search criteria.',
      },
    };
  }

  /**
   * Get eligible inventory count for a specific participating organisation.
   * Public-facing: strictly NO donor PII, NO internal unit IDs.
   */
  static async getOrgPublicAvailability(organisationId: string): Promise<{
    organisationId: string;
    organisationName: string;
    availableComponents: {
      componentType: string;
      bloodGroup: string;
      count: number;
    }[];
    lastUpdated: string;
    note: string;
  }> {
    const org = await prisma.organisation.findUnique({
      where: { id: organisationId, status: 'VERIFIED' },
      select: { id: true, name: true, status: true },
    });

    if (!org) {
      throw new Error('Organisation not found or not verified.');
    }

    const now = new Date();

    // Strict eligibility: AVAILABLE, not expired, not on hold, clinically released
    const eligible = await prisma.componentUnit.findMany({
      where: {
        organisationId,
        status: 'AVAILABLE',
        isHold: false,
        expiresAt: { gt: now },
        clinicalReleases: {
          some: { decision: 'RELEASED' },
        },
      },
      select: {
        componentType: true,
        bloodGroup: true,
        updatedAt: true,
      },
    });

    // Aggregate
    const aggregation = new Map<string, number>();
    let latestUpdate = now;

    for (const comp of eligible) {
      const key = `${comp.componentType}|${comp.bloodGroup}`;
      aggregation.set(key, (aggregation.get(key) || 0) + 1);
      if (comp.updatedAt > latestUpdate) latestUpdate = comp.updatedAt;
    }

    const availableComponents = Array.from(aggregation.entries()).map(([key, count]) => {
      const [ct, bg] = key.split('|');
      return {
        componentType: COMPONENT_DISPLAY[ct] || ct,
        bloodGroup: BLOOD_GROUP_DISPLAY[bg] || bg,
        count,
      };
    });

    return {
      organisationId,
      organisationName: org.name,
      availableComponents,
      lastUpdated: latestUpdate.toISOString(),
      note: 'Authoritative count of clinically released, non-expired, non-held component units. Does not guarantee individual unit suitability for a specific patient. Contact the blood bank.',
    };
  }
}

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────

function normalizeContactPhone(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed === '0' || trimmed === '' || trimmed.length < 6) return null;
  return trimmed;
}

function isDataStale(sourceDate: Date | null, hoursThreshold: number): boolean {
  if (!sourceDate) return true;
  const ageMs = Date.now() - new Date(sourceDate).getTime();
  return ageMs > hoursThreshold * 3600 * 1000;
}
