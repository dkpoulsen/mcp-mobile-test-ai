/**
 * Device routes
 *
 * REST endpoints for device status and management
 */

import type { Router, Request, Response } from 'express';
import { Router as expressRouter } from 'express';
import { asyncHandler, parsePagination, parseFilters, getParam } from './router-utils.js';
import { getPrismaClient } from '../../database/client.js';
import { HttpError } from '../middleware/error-handler.js';

/**
 * Device router
 */
export const devicesRouter: Router = expressRouter();

// Helper to get prisma client lazily
function getPrisma() {
  return getPrismaClient();
}

/**
 * GET /api/devices
 * Get all devices with optional filtering
 */
devicesRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { skip, take } = parsePagination(req);
    const filters = parseFilters(req, ['platform', 'status', 'isEmulator']);

    const where: Record<string, unknown> = {};
    if (filters.platform) {
      where.platform = filters.platform as string;
    }
    if (filters.status) {
      where.status = filters.status as string;
    }
    if (filters.isEmulator !== undefined) {
      where.isEmulator = filters.isEmulator === 'true';
    }

    const [devices, total] = await Promise.all([
      getPrisma().device.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      getPrisma().device.count({ where }),
    ]);

    res.json({
      data: devices,
      pagination: {
        skip,
        take,
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  })
);

/**
 * GET /api/devices/available
 * Get available devices
 */
devicesRouter.get(
  '/available',
  asyncHandler(async (req: Request, res: Response) => {
    const platform = req.query.platform as string | undefined;

    const where: Record<string, unknown> = {
      status: 'AVAILABLE',
    };

    if (platform) {
      where.platform = platform;
    }

    const devices = await getPrisma().device.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json({ data: devices });
  })
);

/**
 * GET /api/devices/:id
 * Get a single device by ID
 */
devicesRouter.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = getParam(req, 'id');
    const device = await getPrisma().device.findUnique({
      where: { id },
      include: {
        testRuns: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            startedAt: true,
            completedAt: true,
            passedCount: true,
            failedCount: true,
          },
        },
      },
    });

    if (!device) {
      throw new HttpError(404, 'Device not found');
    }

    res.json({ data: device });
  })
);

/**
 * POST /api/devices
 * Create a new device
 */
devicesRouter.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { platform, name, osVersion, isEmulator, screenWidth, screenHeight, status } = req.body;

    if (!platform || !name || !osVersion) {
      throw new HttpError(400, 'Missing required fields: platform, name, osVersion');
    }

    const device = await getPrisma().device.create({
      data: {
        platform,
        name,
        osVersion,
        isEmulator: isEmulator ?? false,
        screenWidth: screenWidth ?? null,
        screenHeight: screenHeight ?? null,
        status: status ?? 'AVAILABLE',
      },
    });

    res.status(201).json({ data: device });
  })
);

/**
 * PATCH /api/devices/:id
 * Update a device
 */
devicesRouter.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = getParam(req, 'id');
    const { isEmulator, screenWidth, screenHeight, status } = req.body;

    const device = await getPrisma().device.update({
      where: { id },
      data: {
        ...(isEmulator !== undefined && { isEmulator }),
        ...(screenWidth !== undefined && { screenWidth }),
        ...(screenHeight !== undefined && { screenHeight }),
        ...(status !== undefined && { status }),
      },
    });

    res.json({ data: device });
  })
);

/**
 * PATCH /api/devices/:id/status
 * Update device status
 */
devicesRouter.patch(
  '/:id/status',
  asyncHandler(async (req: Request, res: Response) => {
    const id = getParam(req, 'id');
    const { status } = req.body;

    if (!status) {
      throw new HttpError(400, 'Missing required field: status');
    }

    const device = await getPrisma().device.update({
      where: { id },
      data: { status },
    });

    res.json({ data: device });
  })
);

/**
 * DELETE /api/devices/:id
 * Delete a device
 */
devicesRouter.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = getParam(req, 'id');
    await getPrisma().device.delete({
      where: { id },
    });

    res.status(204).send();
  })
);

/**
 * GET /api/devices/stats/summary
 * Get device statistics
 */
devicesRouter.get(
  '/stats/summary',
  asyncHandler(async (_req: Request, res: Response) => {
    const [total, available, busy, offline, maintenance] = await Promise.all([
      getPrisma().device.count(),
      getPrisma().device.count({ where: { status: 'AVAILABLE' } }),
      getPrisma().device.count({ where: { status: 'BUSY' } }),
      getPrisma().device.count({ where: { status: 'OFFLINE' } }),
      getPrisma().device.count({ where: { status: 'MAINTENANCE' } }),
    ]);

    const [iosCount, androidCount] = await Promise.all([
      getPrisma().device.count({ where: { platform: 'IOS' } }),
      getPrisma().device.count({ where: { platform: 'ANDROID' } }),
    ]);

    res.json({
      data: {
        total,
        byStatus: {
          available,
          busy,
          offline,
          maintenance,
        },
        byPlatform: {
          ios: iosCount,
          android: androidCount,
        },
      },
    });
  })
);
