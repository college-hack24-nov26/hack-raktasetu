import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { fetchExternalBloodCentres, syncCentresToDatabase, normalizeContactPhone } from '../services/eraktkosh';

export const bloodCentresRouter = Router();

/**
 * GET /api/v1/blood-centres
 * Query params: stateCode, districtCode, search, page, limit
 */
bloodCentresRouter.get('/blood-centres', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stateCode = req.query.stateCode ? parseInt(req.query.stateCode as string, 10) : undefined;
    const districtCode = req.query.districtCode ? parseInt(req.query.districtCode as string, 10) : undefined;
    const search = req.query.search ? (req.query.search as string).trim() : undefined;

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const skip = (page - 1) * limit;

    // 1. If both stateCode and districtCode are specified, attempt live discovery from e-RaktKosh
    if (stateCode !== undefined && districtCode !== undefined && !isNaN(stateCode) && !isNaN(districtCode)) {
      const liveResult = await fetchExternalBloodCentres({ stateCode, districtCode });

      if (liveResult.isLive && liveResult.centres.length > 0) {
        // Asynchronously synchronize centres into local DB for relational integrity
        syncCentresToDatabase(liveResult.centres, stateCode, districtCode).catch(() => {});

        let filtered = liveResult.centres;
        if (search) {
          const lowerSearch = search.toLowerCase();
          filtered = filtered.filter((c) => c.hospitalName.toLowerCase().includes(lowerSearch));
        }

        // Deduplicate by hospitalCode
        const seenCodes = new Set<string>();
        filtered = filtered.filter((c) => {
          if (!c.hospitalCode || seenCodes.has(c.hospitalCode)) return false;
          seenCodes.add(c.hospitalCode);
          return true;
        });

        const total = filtered.length;
        const paginated = filtered.slice(skip, skip + limit);
        const totalPages = Math.ceil(total / limit);

        return res.json({
          success: true,
          data: paginated,
          meta: {
            isLive: true,
            source: 'e-RaktKosh Live Directory',
            stateCode,
            districtCode,
          },
          pagination: {
            page,
            limit,
            total,
            totalPages,
          },
        });
      }
    }

    // 2. Fallback to cached local directory if upstream is unreachable or no district specified
    const where: any = {};

    if (stateCode !== undefined && !isNaN(stateCode)) {
      where.stateCode = stateCode;
    }

    if (districtCode !== undefined && !isNaN(districtCode)) {
      where.districtCode = districtCode;
    }

    if (search) {
      where.hospitalName = {
        contains: search,
        mode: 'insensitive',
      };
    }

    const [total, centres] = await Promise.all([
      prisma.bloodCentre.count({ where }),
      prisma.bloodCentre.findMany({
        where,
        skip,
        take: limit,
        orderBy: { hospitalName: 'asc' },
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
        },
      }),
    ]);

    const formattedCentres = centres.map((c) => ({
      ...c,
      mobileNo: normalizeContactPhone(c.mobileNo),
      hasValidContact: normalizeContactPhone(c.mobileNo) !== null,
    }));

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: formattedCentres,
      meta: {
        isLive: false,
        source: 'RaktaSetu Cached Directory',
        stateCode,
        districtCode,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/blood-centres/:id
 * Param: id (hospitalCode)
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
      },
    });
  } catch (error) {
    next(error);
  }
});
