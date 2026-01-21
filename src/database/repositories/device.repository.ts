/**
 * Device repository for database operations on Device entities
 */

import type {
  Device,
  DeviceStatus,
  Platform,
  Prisma,
} from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { Logger } from '../../utils/logger.js';

/**
 * Extended Device type with relations
 */
export type DeviceWithRuns = Device & {
  testRuns?: unknown[];
};

/**
 * Input type for creating a device
 */
export type CreateDeviceInput = {
  platform: Platform;
  name: string;
  osVersion: string;
  isEmulator?: boolean;
  screenWidth?: number | null;
  screenHeight?: number | null;
  status?: DeviceStatus;
};

/**
 * Input type for updating a device
 */
export type UpdateDeviceInput = Partial<Omit<CreateDeviceInput, 'platform' | 'name' | 'osVersion'>> & {
  status?: DeviceStatus;
};

/**
 * Input type for querying devices
 */
export type DeviceQueryInput = {
  platform?: Platform;
  status?: DeviceStatus;
  isEmulator?: boolean;
};

/**
 * Device repository class
 */
export class DeviceRepository {
  constructor(
    private prisma: PrismaClient,
    private logger?: Logger
  ) {}

  /**
   * Find a device by ID
   */
  async findById(id: string): Promise<Device | null> {
    this.logger?.debug(`Finding device by ID: ${id}`);
    return this.prisma.device.findUnique({
      where: { id },
    });
  }

  /**
   * Find a device by platform, name, and OS version
   */
  async findByUnique(platform: Platform, name: string, osVersion: string): Promise<Device | null> {
    return this.prisma.device.findUnique({
      where: {
        platform_name_osVersion: {
          platform,
          name,
          osVersion,
        },
      },
    });
  }

  /**
   * Find all devices with optional filtering
   */
  async findMany(query?: DeviceQueryInput): Promise<Device[]> {
    const where: Prisma.DeviceWhereInput = {};

    if (query?.platform) {
      where.platform = query.platform;
    }
    if (query?.status) {
      where.status = query.status;
    }
    if (query?.isEmulator !== undefined) {
      where.isEmulator = query.isEmulator;
    }

    return this.prisma.device.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find available devices
   */
  async findAvailable(platform?: Platform): Promise<Device[]> {
    return this.findMany({
      status: 'AVAILABLE',
      ...(platform && { platform }),
    });
  }

  /**
   * Create a new device
   */
  async create(input: CreateDeviceInput): Promise<Device> {
    this.logger?.info(`Creating device: ${input.name} (${input.platform})`);

    return this.prisma.device.create({
      data: input,
    });
  }

  /**
   * Create or update a device (upsert)
   */
  async upsert(input: CreateDeviceInput): Promise<Device> {
    return this.prisma.device.upsert({
      where: {
        platform_name_osVersion: {
          platform: input.platform,
          name: input.name,
          osVersion: input.osVersion,
        },
      },
      update: {
        isEmulator: input.isEmulator,
        screenWidth: input.screenWidth,
        screenHeight: input.screenHeight,
        status: input.status,
      },
      create: input,
    });
  }

  /**
   * Update a device
   */
  async update(id: string, input: UpdateDeviceInput): Promise<Device> {
    this.logger?.info(`Updating device: ${id}`);

    return this.prisma.device.update({
      where: { id },
      data: input,
    });
  }

  /**
   * Update device status
   */
  async updateStatus(id: string, status: DeviceStatus): Promise<Device> {
    return this.update(id, { status });
  }

  /**
   * Delete a device
   */
  async delete(id: string): Promise<Device> {
    this.logger?.info(`Deleting device: ${id}`);

    return this.prisma.device.delete({
      where: { id },
    });
  }

  /**
   * Count devices with optional filtering
   */
  async count(query?: DeviceQueryInput): Promise<number> {
    const where: Prisma.DeviceWhereInput = {};

    if (query?.platform) {
      where.platform = query.platform;
    }
    if (query?.status) {
      where.status = query.status;
    }
    if (query?.isEmulator !== undefined) {
      where.isEmulator = query.isEmulator;
    }

    return this.prisma.device.count({ where });
  }
}
