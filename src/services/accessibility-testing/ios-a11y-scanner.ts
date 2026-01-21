/**
 * iOS Accessibility Scanner
 *
 * Scans iOS applications for accessibility violations using the accessibility tree.
 * Implements checks for missing labels, low contrast, and focus issues.
 */

import type {
  AccessibilityTreeNode,
  AccessibilityViolation,
  AccessibilityDriver,
  AccessibilityScanConfig,
} from './types.js';
import {
  AccessibilityViolationType,
  AccessibilitySeverity,
  AccessibilityError,
  AccessibilityErrorType,
} from './types.js';
import { createModuleLogger } from '../../utils/logger.js';

const logger = createModuleLogger('ios-a11y-scanner');

/**
 * iOS-specific accessibility traits
 */
const IOSS_ACCESSIBILITY_TRAITS = {
  BUTTON: 0x1,
  LINK: 0x2,
  SEARCH_FIELD: 0x4,
  IMAGE: 0x8,
  SELECTED: 0x10,
  PLAYS_SOUND: 0x20,
  KEYBOARD_KEY: 0x40,
  STATIC_TEXT: 0x80,
  SUMMARY_ELEMENT: 0x100,
  NOT_ENABLED: 0x200,
  UPDATES_FREQUENTLY: 0x400,
  STARTS_MEDIA_SESSION: 0x800,
  ADJUSTABLE: 0x1000,
  ALLOWS_DIRECT_INTERACTION: 0x2000,
  CAUSES_PAGE_TURN: 0x4000,
  HEADER: 0x8000,
};

/**
 * iOS Accessibility Scanner class
 */
export class IOSA11yScanner {
  private driver: AccessibilityDriver;

  constructor(driver: AccessibilityDriver) {
    this.driver = driver;
  }

  /**
   * Run full accessibility scan
   */
  async scan(config: AccessibilityScanConfig = {}): Promise<AccessibilityViolation[]> {
    const startTime = Date.now();
    const violations: AccessibilityViolation[] = [];

    logger.info('Starting iOS accessibility scan', { config });

    try {
      const tree = await this.driver.getAccessibilityTree();

      if (config.checkMissingLabels !== false) {
        violations.push(...await this.checkMissingLabels(tree));
      }

      if (config.checkContrast !== false) {
        violations.push(...await this.checkContrast(tree));
      }

      if (config.checkFocus !== false) {
        violations.push(...await this.checkFocus(tree));
      }

      if (config.checkTouchTargets !== false) {
        violations.push(...await this.checkTouchTargets(tree));
      }

      if (config.checkDuplicateIds !== false) {
        violations.push(...await this.checkDuplicateIds(tree));
      }

      const duration = Date.now() - startTime;
      logger.info('iOS accessibility scan completed', {
        violationCount: violations.length,
        duration,
      });

      return violations;
    } catch (error) {
      logger.error('iOS accessibility scan failed', { error });
      throw new AccessibilityError(
        AccessibilityErrorType.TREE_PARSE_FAILED,
        `Failed to scan iOS accessibility: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Check for missing accessibility labels
   */
  private async checkMissingLabels(tree: AccessibilityTreeNode): Promise<AccessibilityViolation[]> {
    const violations: AccessibilityViolation[] = [];

    const checkNode = (node: AccessibilityTreeNode) => {
      // Skip non-accessible elements
      if (!node.accessible || !node.visible) {
        return;
      }

      // Check interactive elements for labels
      const isInteractive = this.isInteractiveRole(node.role);
      const isButton = node.role === 'button' || node.role === 'Button';
      const isLink = node.role === 'link' || node.role === 'Link';
      const isImage = node.role === 'image' || node.role === 'Image';
      const isField = node.role === 'textField' || node.role === 'searchField';

      // Check for missing label on interactive elements
      if ((isInteractive || isButton || isLink) && !node.label && !node.value) {
        violations.push({
          id: this.generateViolationId('missing_label', node.id),
          type: AccessibilityViolationType.MISSING_LABEL,
          severity: AccessibilitySeverity.CRITICAL,
          element: {
            identifier: node.id,
            elementType: node.role,
            bounds: node.bounds,
            text: node.value,
            accessibilityLabel: node.label,
            trait: node.role,
          },
          message: `Interactive ${node.role} element lacks an accessibility label`,
          wcagCriteria: 'WCAG 2.1 2.4.4, 2.5.3',
          recommendation: `Add an accessibilityLabel to describe the element's purpose`,
          platform: 'ios',
        });
      }

      // Check for missing alt text on images
      if (isImage && !node.label && !node.hint) {
        violations.push({
          id: this.generateViolationId('missing_alt', node.id),
          type: AccessibilityViolationType.MISSING_ALT_TEXT,
          severity: AccessibilitySeverity.SERIOUS,
          element: {
            identifier: node.id,
            elementType: node.role,
            bounds: node.bounds,
            accessibilityLabel: node.label,
          },
          message: 'Image lacks accessibility label (alt text)',
          wcagCriteria: 'WCAG 2.1 1.1.1',
          recommendation: 'Add accessibilityLabel to describe the image content',
          platform: 'ios',
        });
      }

      // Check for unlabeled input fields
      if (isField && !node.label) {
        violations.push({
          id: this.generateViolationId('unlabeled_field', node.id),
          type: AccessibilityViolationType.UNLABELED_FIELD,
          severity: AccessibilitySeverity.SERIOUS,
          element: {
            identifier: node.id,
            elementType: node.role,
            bounds: node.bounds,
            accessibilityLabel: node.label,
          },
          message: 'Input field lacks an accessibility label',
          wcagCriteria: 'WCAG 2.1 1.3.1, 2.5.3',
          recommendation: 'Add accessibilityLabel or placeholder to describe the field',
          platform: 'ios',
        });
      }

      // Check children recursively
      if (node.children) {
        node.children.forEach(checkNode);
      }
    };

    checkNode(tree);
    return violations;
  }

  /**
   * Check for contrast issues
   */
  private async checkContrast(tree: AccessibilityTreeNode): Promise<AccessibilityViolation[]> {
    const violations: AccessibilityViolation[] = [];

    const checkNode = async (node: AccessibilityTreeNode) => {
      if (!node.accessible || !node.visible || !node.id) {
        return;
      }

      // Only check text-containing elements
      if (!this.containsText(node)) {
        return;
      }

      try {
        const style = await this.driver.getElementStyle(node.id);

        if (style.color && style.backgroundColor) {
          // Basic contrast check
          const fg = style.color;
          const bg = style.backgroundColor;

          // Calculate luminance-based contrast (simplified)
          const contrast = this.estimateContrast(fg, bg);

          // WCAG AA requires 4.5:1 for normal text, 3:1 for large text
          const fontSize = parseFloat(style.fontSize || '16');
          const isLargeText = fontSize >= 18;
          const requiredRatio = isLargeText ? 3.0 : 4.5;

          if (contrast < requiredRatio) {
            violations.push({
              id: this.generateViolationId('low_contrast', node.id),
              type: AccessibilityViolationType.LOW_CONTRAST,
              severity: AccessibilitySeverity.SERIOUS,
              element: {
                identifier: node.id,
                elementType: node.role,
                bounds: node.bounds,
                text: node.value,
              },
              message: `Contrast ratio ${contrast.toFixed(2)}:1 is below WCAG AA requirement of ${requiredRatio}:1`,
              wcagCriteria: 'WCAG 2.1 1.4.3',
              recommendation: `Increase contrast. Current foreground: ${fg}, background: ${bg}`,
              platform: 'ios',
            });
          }
        }
      } catch (error) {
        logger.debug('Could not check contrast for element', { id: node.id, error });
      }

      if (node.children) {
        for (const child of node.children) {
          await checkNode(child);
        }
      }
    };

    await checkNode(tree);
    return violations;
  }

  /**
   * Check for focus issues
   */
  private async checkFocus(tree: AccessibilityTreeNode): Promise<AccessibilityViolation[]> {
    const violations: AccessibilityViolation[] = [];
    const focusableElements: Array<{ id: string; role: string; label?: string }> = [];

    const collectFocusable = (node: AccessibilityTreeNode) => {
      if (!node.accessible || !node.visible) {
        return;
      }

      if (node.focusable && node.enabled) {
        focusableElements.push({
          id: node.id,
          role: node.role,
          label: node.label,
        });
      }

      if (node.children) {
        node.children.forEach(collectFocusable);
      }
    };

    collectFocusable(tree);

    // Check for VoiceOver focus order
    // iOS doesn't have traditional tab order, but VoiceOver navigation should be logical
    // We'll check for interactive elements without proper accessibility setup

    for (const elem of focusableElements) {
      if (!elem.label && this.isInteractiveRole(elem.role)) {
        violations.push({
          id: this.generateViolationId('no_focus_label', elem.id),
          type: AccessibilityViolationType.NO_FOCUS,
          severity: AccessibilitySeverity.SERIOUS,
          element: {
            identifier: elem.id,
            elementType: elem.role,
            accessibilityLabel: elem.label,
          },
          message: `Focusable ${elem.role} element lacks accessibility label for VoiceOver`,
          wcagCriteria: 'WCAG 2.1 2.4.3, 2.5.3',
          recommendation: 'Add accessibilityLabel for proper VoiceOver announcement',
          platform: 'ios',
        });
      }
    }

    return violations;
  }

  /**
   * Check touch target sizes (iOS minimum: 44x44pt)
   */
  private async checkTouchTargets(tree: AccessibilityTreeNode): Promise<AccessibilityViolation[]> {
    const violations: AccessibilityViolation[] = [];

    const checkNode = (node: AccessibilityTreeNode) => {
      if (!node.accessible || !node.visible) {
        return;
      }

      // Only check interactive elements
      if (this.isInteractiveRole(node.role) && node.bounds) {
        const minSize = 44; // iOS HIG recommends 44x44pt
        const width = node.bounds.width;
        const height = node.bounds.height;

        if (width < minSize || height < minSize) {
          violations.push({
            id: this.generateViolationId('small_target', node.id),
            type: AccessibilityViolationType.SMALL_TOUCH_TARGET,
            severity: AccessibilitySeverity.MODERATE,
            element: {
              identifier: node.id,
              elementType: node.role,
              bounds: node.bounds,
            },
            message: `Touch target size (${width}x${height}) is below iOS recommendation of ${minSize}x${minSize}`,
            wcagCriteria: 'WCAG 2.1 2.5.5',
            recommendation: `Increase touch target to at least ${minSize}x${minSize} points`,
            platform: 'ios',
          });
        }
      }

      if (node.children) {
        node.children.forEach(checkNode);
      }
    };

    checkNode(tree);
    return violations;
  }

  /**
   * Check for duplicate accessibility identifiers
   */
  private async checkDuplicateIds(tree: AccessibilityTreeNode): Promise<AccessibilityViolation[]> {
    const violations: AccessibilityViolation[] = [];
    const idMap = new Map<string, string[]>();

    const collectIds = (node: AccessibilityTreeNode) => {
      if (node.id && node.accessible) {
        if (!idMap.has(node.id)) {
          idMap.set(node.id, []);
        }
        idMap.get(node.id)!.push(node.role);
      }

      if (node.children) {
        node.children.forEach(collectIds);
      }
    };

    collectIds(tree);

    // Find duplicates
    for (const [id, roles] of idMap.entries()) {
      if (roles.length > 1) {
        violations.push({
          id: this.generateViolationId('duplicate_id', id),
          type: AccessibilityViolationType.DUPLICATE_IDENTIFIER,
          severity: AccessibilitySeverity.MINOR,
          element: {
            identifier: id,
            elementType: roles[0],
          },
          message: `Accessibility identifier "${id}" is used by ${roles.length} elements`,
          wcagCriteria: 'N/A',
          recommendation: 'Use unique accessibility identifiers for interactive elements',
          platform: 'ios',
        });
      }
    }

    return violations;
  }

  /**
   * Determine if a role is interactive
   */
  private isInteractiveRole(role: string): boolean {
    const interactiveRoles = [
      'button',
      'link',
      'searchField',
      'textField',
      'adjustable',
      'picker',
      'switch',
      'slider',
      'segmentedControl',
      'tabBar',
      'button',
      'cell',
    ];

    const lowerRole = role.toLowerCase();
    return interactiveRoles.some((r) => lowerRole.includes(r.toLowerCase()));
  }

  /**
   * Check if node contains text
   */
  private containsText(node: AccessibilityTreeNode): boolean {
    return Boolean(
      (node.value && node.value.length > 0) ||
      (node.label && node.label.length > 0) ||
      node.role === 'text' ||
      node.role === 'staticText'
    );
  }

  /**
   * Estimate contrast ratio from color strings
   */
  private estimateContrast(foreground: string, background: string): number {
    // Simplified contrast calculation
    // In production, use the full luminance formula from ContrastAnalyzer

    const parseHex = (hex: string) => {
      const clean = hex.replace(/^#/, '');
      if (clean.length === 3) {
        return {
          r: parseInt(clean[0] + clean[0], 16),
          g: parseInt(clean[1] + clean[1], 16),
          b: parseInt(clean[2] + clean[2], 16),
        };
      }
      return {
        r: parseInt(clean.substring(0, 2), 16),
        g: parseInt(clean.substring(2, 4), 16),
        b: parseInt(clean.substring(4, 6), 16),
      };
    };

    const luminance = (r: number, g: number, b: number) => {
      const [rs, gs, bs] = [r, g, b].map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    };

    try {
      const fg = parseHex(foreground);
      const bg = parseHex(background);
      const l1 = luminance(fg.r, fg.g, fg.b);
      const l2 = luminance(bg.r, bg.g, bg.b);
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
    } catch {
      return 21; // Maximum contrast for black/white
    }
  }

  /**
   * Generate unique violation ID
   */
  private generateViolationId(type: string, elementId: string): string {
    return `ios_${type}_${elementId}_${Date.now()}`;
  }
}

/**
 * Create iOS accessibility scanner
 */
export function createIOSA11yScanner(driver: AccessibilityDriver): IOSA11yScanner {
  return new IOSA11yScanner(driver);
}
