import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { fetchExternalBloodCentres, syncCentresToDatabase, normalizeContactPhone } from '../services/eraktkosh';

export const bloodCentresRouter = Router();

/**
 * GET /api/v1/blood-centres
 * Query params: stateCode, districtCode, search, page, limit, source ('internal' | 'external' | 'all')
 */
bloodCentresRouter.get('/blood-centres', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stateCode = req.query.stateCode ? parseInt(req.query.stateCode as string, 10) : undefined;
    const districtCode = req.query.districtCode ? parseInt(req.query.districtCode as string, 10) : undefined;
    const search = req.query.search ? (req.query.search as string).trim() : undefined;
    const sourceParam = (req.query.source ? String(req.query.source).toLowerCase().trim() : 'all') as
      | 'internal'
      | 'external'
      | 'all';

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const skip = (page - 1) * limit;

    // Helper: query RaktaSetu participating organisations
    const fetchInternalOrganisations = async () => {
      const orgWhere: any = { status: 'VERIFIED' };
      if (stateCode !== undefined && !isNaN(stateCode)) orgWhere.stateCode = stateCode;
      if (districtCode !== undefined && !isNaN(districtCode)) orgWhere.districtCode = districtCode;
      if (search) {
        orgWhere.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { orgCode: { contains: search, mode: 'insensitive' } },
          { hospitalCode: { contains: search, mode: 'insensitive' } },
        ];
      }

      const orgs = await prisma.organisation.findMany({
        where: orgWhere,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          orgCode: true,
          name: true,
          hospitalCode: true,
          address: true,
          phone: true,
          stateCode: true,
          districtCode: true,
          districtName: true,
          updatedAt: true,
        },
      });

      return orgs.map((org) => {
        const validPhone = normalizeContactPhone(org.phone);
        const code = org.hospitalCode || org.orgCode;
        return {
          hospitalCode: code,
          hospitalName: org.name,
          mobileNo: validPhone,
          hasValidContact: validPhone !== null,
          address: org.address,
          stateCode: org.stateCode,
          districtCode: org.districtCode,
          isParticipatingCentre: true,
          sourceType: 'INTERNAL' as const,
          sourceLabel: 'RaktaSetu Participating Centre',
          orgCode: org.orgCode,
          lastFetchedAt: org.updatedAt,
        };
      });
    };

    // Helper: query external e-RaktKosh blood centres
    const fetchExternalCentres = async () => {
      if (stateCode !== undefined && districtCode !== undefined && !isNaN(stateCode) && !isNaN(districtCode)) {
        const liveResult = await fetchExternalBloodCentres({ stateCode, districtCode });
        if (liveResult.isLive && liveResult.centres.length > 0) {
          syncCentresToDatabase(liveResult.centres, stateCode, districtCode).catch(() => {});
          let filtered = liveResult.centres;
          if (search) {
            const lowerSearch = search.toLowerCase();
            filtered = filtered.filter((c) => c.hospitalName.toLowerCase().includes(lowerSearch));
          }
          const seen = new Set<string>();
          return filtered
            .filter((c) => {
              if (!c.hospitalCode || seen.has(c.hospitalCode)) return false;
              seen.add(c.hospitalCode);
              return true;
            })
            .map((c) => ({
              ...c,
              mobileNo: normalizeContactPhone(c.mobileNo),
              hasValidContact: normalizeContactPhone(c.mobileNo) !== null,
              isParticipatingCentre: false,
              sourceType: 'EXTERNAL' as const,
              sourceLabel: 'e-RaktKosh Blood Bank',
            }));
        }
      }

      const where: any = {};
      if (stateCode !== undefined && !isNaN(stateCode)) where.stateCode = stateCode;
      if (districtCode !== undefined && !isNaN(districtCode)) where.districtCode = districtCode;
      if (search) where.hospitalName = { contains: search, mode: 'insensitive' };

      const dbCentres = await prisma.bloodCentre.findMany({
        where,
        orderBy: { hospitalName: 'asc' },
        select: {
          hospitalCode: true,
          hospitalName: true,
          mobileNo: true,
          address: true,
          stateCode: true,
          districtCode: true,
          lastFetchedAt: true,
        },
      });

      return dbCentres.map((c) => ({
        ...c,
        mobileNo: normalizeContactPhone(c.mobileNo),
        hasValidContact: normalizeContactPhone(c.mobileNo) !== null,
        isParticipatingCentre: false,
        sourceType: 'EXTERNAL' as const,
        sourceLabel: 'e-RaktKosh Blood Bank',
      }));
    };

    if (sourceParam === 'internal') {
      const internalCentres = await fetchInternalOrganisations();
      const total = internalCentres.length;
      const paginated = internalCentres.slice(skip, skip + limit);
      const totalPages = Math.ceil(total / limit);

      return res.json({
        success: true,
        data: paginated,
        meta: {
          isLive: true,
          source: 'RaktaSetu Participating Centres Directory',
          sourceType: 'INTERNAL',
          stateCode,
          districtCode,
        },
        pagination: { page, limit, total, totalPages },
      });
    }

    if (sourceParam === 'external') {
      const externalCentres = await fetchExternalCentres();
      const total = externalCentres.length;
      const paginated = externalCentres.slice(skip, skip + limit);
      const totalPages = Math.ceil(total / limit);

      return res.json({
        success: true,
        data: paginated,
        meta: {
          isLive: true,
          source: 'e-RaktKosh Live Directory',
          sourceType: 'EXTERNAL',
          stateCode,
          districtCode,
        },
        pagination: { page, limit, total, totalPages },
      });
    }

    // Default: sourceParam === 'all'
    const [internalCentres, externalCentres] = await Promise.all([
      fetchInternalOrganisations(),
      fetchExternalCentres(),
    ]);

    const seenCodes = new Set<string>();
    const combined: (typeof internalCentres[0] | typeof externalCentres[0])[] = [];

    // Internal participating centres first
    for (const c of internalCentres) {
      if (!c.hospitalCode || seenCodes.has(c.hospitalCode)) continue;
      seenCodes.add(c.hospitalCode);
      combined.push(c);
    }
    for (const c of externalCentres) {
      if (!c.hospitalCode || seenCodes.has(c.hospitalCode)) continue;
      seenCodes.add(c.hospitalCode);
      combined.push(c);
    }

    const total = combined.length;
    const paginated = combined.slice(skip, skip + limit);
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: paginated,
      meta: {
        isLive: true,
        source: 'RaktaSetu Combined Directory',
        sourceType: 'ALL',
        participatingCount: internalCentres.length,
        externalCount: externalCentres.length,
        stateCode,
        districtCode,
      },
      pagination: { page, limit, total, totalPages },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/blood-centres/:id
 * Param: id (hospitalCode or orgCode or org ID)
 */
bloodCentresRouter.get('/blood-centres/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Valid blood centre hospitalCode identifier is required',
          code: 'INVALID_IDENTIFIER',
        },
      });
    }

    // 1. First check if id matches a RaktaSetu participating organisation
    const org = await prisma.organisation.findFirst({
      where: {
        OR: [{ id }, { orgCode: id }, { hospitalCode: id }],
        status: 'VERIFIED',
      },
      select: {
        id: true,
        orgCode: true,
        name: true,
        hospitalCode: true,
        address: true,
        phone: true,
        stateCode: true,
        districtCode: true,
        districtName: true,
        updatedAt: true,
      },
    });

    if (org) {
      // Query active inventory snapshots from ComponentUnit
      const availableComponents = await prisma.componentUnit.findMany({
        where: {
          organisationId: org.id,
          status: 'AVAILABLE',
          isHold: false,
          expiresAt: { gt: new Date() },
        },
        select: {
          componentType: true,
          bloodGroup: true,
          updatedAt: true,
        },
      });

      // Group by component & bloodGroup
      const stockMap = new Map<string, { count: number; lastUpdated: Date }>();
      for (const comp of availableComponents) {
        const key = `${comp.componentType}_${comp.bloodGroup}`;
        const existing = stockMap.get(key) || { count: 0, lastUpdated: comp.updatedAt };
        existing.count += 1;
        if (comp.updatedAt > existing.lastUpdated) existing.lastUpdated = comp.updatedAt;
        stockMap.set(key, existing);
      }

      const snapshots = Array.from(stockMap.entries()).map(([key, info], idx) => {
        const [cType, bg] = key.split('_');
        return {
          id: `snap-${org.orgCode}-${idx}`,
          component: cType,
          bloodGroup: bg,
          rawStockString: `${info.count} Units`,
          reportedQuantity: info.count,
          quantityUnit: 'Units',
          sourceEntryDate: info.lastUpdated.toISOString(),
          retrievedAt: new Date().toISOString(),
          isStale: false,
        };
      });

      const validContact = normalizeContactPhone(org.phone);
      return res.json({
        success: true,
        data: {
          hospitalCode: org.hospitalCode || org.orgCode,
          hospitalName: org.name,
          mobileNo: validContact,
          hasValidContact: validContact !== null,
          address: org.address,
          stateCode: org.stateCode,
          districtCode: org.districtCode,
          isParticipatingCentre: true,
          sourceType: 'INTERNAL',
          sourceLabel: 'RaktaSetu Participating Centre',
          lastFetchedAt: org.updatedAt,
          snapshots,
          stockSnapshot: snapshots,
        },
      });
    }

    // 2. Fallback to external e-RaktKosh blood centres table
    const centre = await prisma.bloodCentre.findUnique({
      where: { hospitalCode: id },
      select: {
        hospitalCode: true,
        hospitalName: true,
        mobileNo: true,
        address: true,
        stateCode: true,
        districtCode: true,
        lastFetchedAt: true,
        createdAt: true,
        updatedAt: true,
        snapshots: {
          orderBy: { retrievedAt: 'desc' },
          take: 10,
          select: {
            id: true,
            component: true,
            bloodGroup: true,
            rawStockString: true,
            reportedQuantity: true,
            quantityUnit: true,
            sourceEntryDate: true,
            retrievedAt: true,
            isStale: true,
          },
        },
      },
    });

    if (!centre) {
      return res.status(404).json({
        success: false,
        error: {
          message: `Blood centre with code '${id}' not found`,
          code: 'CENTRE_NOT_FOUND',
        },
      });
    }

    const validContact = normalizeContactPhone(centre.mobileNo);

    res.json({
      success: true,
      data: {
        ...centre,
        mobileNo: validContact,
        hasValidContact: validContact !== null,
        isParticipatingCentre: false,
        sourceType: 'EXTERNAL',
        sourceLabel: 'e-RaktKosh Blood Bank',
      },
    });
  } catch (error) {
    next(error);
  }
});
