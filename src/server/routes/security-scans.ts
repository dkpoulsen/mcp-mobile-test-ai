/**
 * Security Scan Routes
 *
 * API endpoints for security scanning functionality.
 */

import type { Router, Request, Response } from 'express';
import { Router as expressRouter } from 'express';
import { asyncHandler } from './router-utils.js';
import {
  getSecurityScanner,
  SecurityReportFormat,
  SecurityCategory,
  SecuritySeverity,
  type SecurityScanOptions,
} from '../../services/security-scanner/index.js';

/**
 * Security scan router
 */
export const securityScansRouter: Router = expressRouter();

/**
 * POST /api/security-scans/scan
 * Perform a security scan with custom options
 */
securityScansRouter.post(
  '/scan',
  asyncHandler(async (req: Request, res: Response) => {
    const options: Partial<SecurityScanOptions> = req.body.options || {};
    const scanner = getSecurityScanner();

    const result = await scanner.scan(options);

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * GET /api/security-scans/quick
 * Perform a quick security scan (critical and high severity only)
 */
securityScansRouter.get(
  '/quick',
  asyncHandler(async (req: Request, res: Response) => {
    const paths = req.query.paths as string | undefined;
    const scanPaths = paths ? paths.split(',') : undefined;

    const scanner = getSecurityScanner();
    const result = await scanner.quickScan(scanPaths);

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * POST /api/security-scans/api-keys
 * Scan for exposed API keys
 */
securityScansRouter.post(
  '/api-keys',
  asyncHandler(async (req: Request, res: Response) => {
    const paths = req.body.paths as string[] | undefined;
    const scanner = getSecurityScanner();

    const result = await scanner.scanForAPIKeys(paths);

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * POST /api/security-scans/storage
 * Scan for insecure data storage
 */
securityScansRouter.post(
  '/storage',
  asyncHandler(async (req: Request, res: Response) => {
    const paths = req.body.paths as string[] | undefined;
    const scanner = getSecurityScanner();

    const result = await scanner.scanForInsecureStorage(paths);

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * POST /api/security-scans/network
 * Scan for insecure network configurations
 */
securityScansRouter.post(
  '/network',
  asyncHandler(async (req: Request, res: Response) => {
    const paths = req.body.paths as string[] | undefined;
    const scanner = getSecurityScanner();

    const result = await scanner.scanForNetworkIssues(paths);

    res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * POST /api/security-scans/report
 * Generate a security report
 */
securityScansRouter.post(
  '/report',
  asyncHandler(async (req: Request, res: Response) => {
    const { scanResult, format } = req.body;

    if (!scanResult) {
      res.status(400).json({
        success: false,
        error: 'scanResult is required',
      });
      return;
    }

    const scanner = getSecurityScanner();
    const reportFormat = (format || 'text') as SecurityReportFormat;
    const report = scanner.generateReport(scanResult, reportFormat);

    // Set content type based on format
    const contentTypes: Record<SecurityReportFormat, string> = {
      [SecurityReportFormat.JSON]: 'application/json',
      [SecurityReportFormat.TEXT]: 'text/plain',
      [SecurityReportFormat.HTML]: 'text/html',
      [SecurityReportFormat.MARKDOWN]: 'text/markdown',
    };

    res.setHeader('Content-Type', contentTypes[reportFormat]);
    res.send(report);
  })
);

/**
 * POST /api/security-scans/report/save
 * Generate and save a security report to a file
 */
securityScansRouter.post(
  '/report/save',
  asyncHandler(async (req: Request, res: Response) => {
    const { scanResult, outputPath, format } = req.body;

    if (!scanResult || !outputPath) {
      res.status(400).json({
        success: false,
        error: 'scanResult and outputPath are required',
      });
      return;
    }

    const scanner = getSecurityScanner();
    const reportFormat = format as SecurityReportFormat;

    await scanner.saveReport(scanResult, outputPath, reportFormat);

    res.json({
      success: true,
      data: {
        message: 'Report saved successfully',
        path: outputPath,
        format: reportFormat || 'auto-detected',
      },
    });
  })
);

/**
 * GET /api/security-scans/patterns
 * Get all registered security patterns
 */
securityScansRouter.get(
  '/patterns',
  asyncHandler(async (_req: Request, res: Response) => {
    const scanner = getSecurityScanner();

    const patterns = {
      apiKeys: scanner.getAPIKeyDetector().getPatterns(),
      storage: scanner.getStorageChecker().getPatterns(),
      network: scanner.getNetworkChecker().getPatterns(),
    };

    res.json({
      success: true,
      data: patterns,
    });
  })
);

/**
 * GET /api/security-scans/categories
 * Get all security categories
 */
securityScansRouter.get(
  '/categories',
  asyncHandler(async (_req: Request, res: Response) => {
    const categories = Object.values(SecurityCategory).map((cat) => ({
      value: cat,
      label: cat.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
    }));

    res.json({
      success: true,
      data: categories,
    });
  })
);

/**
 * GET /api/security-scans/severities
 * Get all severity levels
 */
securityScansRouter.get(
  '/severities',
  asyncHandler(async (_req: Request, res: Response) => {
    const severities = Object.values(SecuritySeverity).map((sev) => ({
      value: sev,
      label: sev.toUpperCase(),
      priority: {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
        info: 4,
      }[sev],
    }));

    res.json({
      success: true,
      data: severities,
    });
  })
);

/**
 * GET /api/security-scans/formats
 * Get all supported report formats
 */
securityScansRouter.get(
  '/formats',
  asyncHandler(async (_req: Request, res: Response) => {
    const formats = Object.values(SecurityReportFormat).map((fmt) => ({
      value: fmt,
      label: fmt.toUpperCase(),
      extension: {
        json: '.json',
        text: '.txt',
        html: '.html',
        markdown: '.md',
      }[fmt],
    }));

    res.json({
      success: true,
      data: formats,
    });
  })
);
