/**
 * Android Accessibility Scanner
 *
 * Scans Android applications for accessibility violations using AccessibilityService.
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

const logger = createModuleLogger('android-a11y-scanner');

/**
 * Android accessibility node important attributes
 */
const ANDROID_ROLES = {
  BUTTON: 'button',
  CHECKBOX: 'checkbox',
  RADIO_BUTTON: 'radio_button',
  TOGGLE_BUTTON: 'toggle_button',
  SPINNER: 'dropdown',
  EDIT_TEXT: 'edit_text',
  SEEKBAR: 'seekbar',
  IMAGE: 'image',
  IMAGE_BUTTON: 'image_button',
  TEXT_VIEW: 'text_view',
  WEB_VIEW: 'web_view',
  LIST_VIEW: 'list_view',
  GRID_VIEW: 'grid_view',
  TAB_WIDGET: 'tab_widget',
  PAGER: 'pager',
};

/**
 * Android Accessibility Scanner class
 */
export class AndroidA11yScanner {
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

    logger.info('Starting Android accessibility scan', { config });

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
      logger.info('Android accessibility scan completed', {
        violationCount: violations.length,
        duration,
      });

      return violations;
    } catch (error) {
      logger.error('Android accessibility scan failed', { error });
      throw new AccessibilityError(
        AccessibilityErrorType.TREE_PARSE_FAILED,
        `Failed to scan Android accessibility: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Check for missing content descriptions
   */
  private async checkMissingLabels(tree: AccessibilityTreeNode): Promise<AccessibilityViolation[]> {
    const violations: AccessibilityViolation[] = [];

    const checkNode = (node: AccessibilityTreeNode) => {
      // Skip non-important nodes
      if (!this.isImportantNode(node)) {
        return;
      }

      const role = node.role.toLowerCase();
      const isClickable = node.attributes?.clickable === true;
      const isFocusable = node.focusable;
      const isEditable = node.attributes?.editable === true;
      const isImage = role.includes('image');
      const isIcon = role.includes('icon') || node.attributes?.icon !== undefined;

      // Check for missing contentDescription on clickable elements
      if ((isClickable || isFocusable) && !node.label && !node.value) {
        // Exception: text views with text content don't need contentDescription
        const hasText = node.value && node.value.length > 0;
        const isTextView = role.includes('text');

        if (!hasText || !isTextView) {
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
              trait: node.attributes?.className as string | undefined,
            },
            message: `Interactive element (${node.role}) lacks contentDescription`,
            wcagCriteria: 'WCAG 2.1 2.4.4, 2.5.3, 4.1.2',
            recommendation: 'Add android:contentDescription attribute',
            platform: 'android',
          });
        }
      }

      // Check for missing alt text on images
      if ((isImage || isIcon) && !node.label && !node.hint) {
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
          message: 'Image/icon lacks contentDescription (alt text)',
          wcagCriteria: 'WCAG 2.1 1.1.1',
          recommendation: 'Add android:contentDescription to describe the image',
          platform: 'android',
        });
      }

      // Check for unlabeled input fields
      if (isEditable && !node.label && !node.hint) {
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
          message: 'EditText field lacks label (android:labelFor or hint)',
          wcagCriteria: 'WCAG 2.1 1.3.1, 2.5.3',
          recommendation: 'Add android:hint or associate with a label using android:labelFor',
          platform: 'android',
        });
      }

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
      if (!this.isImportantNode(node) || !node.id) {
        return;
      }

      // Only check text-containing elements
      if (!this.containsText(node)) {
        return;
      }

      try {
        const style = await this.driver.getElementStyle(node.id);

        if (style.color && style.backgroundColor) {
          const fg = style.color;
          const bg = style.backgroundColor;
          const contrast = this.estimateContrast(fg, bg);

          const fontSize = parseFloat(style.fontSize || '14');
          const isLargeText = fontSize >= 18 || (fontSize >= 14 && parseInt(style.fontWeight || '400') >= 700);
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
              platform: 'android',
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
    const focusableElements: Array<{
      id: string;
      role: string;
      label?: string;
      index?: number;
    }> = [];
    let focusIndex = 0;

    const collectFocusable = (node: AccessibilityTreeNode, depth: number) => {
      if (!this.isImportantNode(node)) {
        return;
      }

      const isClickable = node.attributes?.clickable === true;
      const isFocusable = node.focusable;
      const isEditable = node.attributes?.editable === true;

      if ((isClickable || isFocusable || isEditable) && node.enabled) {
        focusableElements.push({
          id: node.id,
          role: node.role,
          label: node.label,
          index: focusIndex++,
        });
      }

      if (node.children) {
        node.children.forEach((child) => collectFocusable(child, depth + 1));
      }
    };

    collectFocusable(tree, 0);

    // Check focusable elements without labels
    for (const elem of focusableElements) {
      if (!elem.label && !this.hasTextValue(elem)) {
        violations.push({
          id: this.generateViolationId('no_focus_label', elem.id),
          type: AccessibilityViolationType.NO_FOCUS,
          severity: AccessibilitySeverity.SERIOUS,
          element: {
            identifier: elem.id,
            elementType: elem.role,
            accessibilityLabel: elem.label,
          },
          message: `Focusable element (${elem.role}) lacks contentDescription for TalkBack`,
          wcagCriteria: 'WCAG 2.1 2.4.3, 2.5.3',
          recommendation: 'Add android:contentDescription for proper TalkBack announcement',
          platform: 'android',
        });
      }
    }

    return violations;
  }

  /**
   * Check touch target sizes (Android minimum: 48x48dp)
   */
  private async checkTouchTargets(tree: AccessibilityTreeNode): Promise<AccessibilityViolation[]> {
    const violations: AccessibilityViolation[] = [];

    const checkNode = (node: AccessibilityTreeNode) => {
      if (!this.isImportantNode(node)) {
        return;
      }

      const isClickable = node.attributes?.clickable === true;
      const isFocusable = node.focusable;

      if ((isClickable || isFocusable) && node.bounds) {
        const minSize = 48; // Android Material Design recommends 48x48dp
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
            message: `Touch target size (${width}x${height}) is below Android recommendation of ${minSize}x${minSize}`,
            wcagCriteria: 'WCAG 2.1 2.5.5',
            recommendation: `Increase touch target to at least ${minSize}x${minSize} dp or use padding/insets`,
            platform: 'android',
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
   * Check for duplicate content descriptions
   */
  private async checkDuplicateIds(tree: AccessibilityTreeNode): Promise<AccessibilityViolation[]> {
    const violations: AccessibilityViolation[] = [];
    const labelMap = new Map<string, string[]>();

    const collectLabels = (node: AccessibilityTreeNode) => {
      if (this.isImportantNode(node) && node.label && node.label.length > 0) {
        const isClickable = node.attributes?.clickable === true;
        const isFocusable = node.focusable;

        // Only track interactive elements
        if (isClickable || isFocusable) {
          if (!labelMap.has(node.label)) {
            labelMap.set(node.label, []);
          }
          labelMap.get(node.label)!.push(node.id);
        }
      }

      if (node.children) {
        node.children.forEach(collectLabels);
      }
    };

    collectLabels(tree);

    // Find duplicates
    for (const [label, ids] of labelMap.entries()) {
      if (ids.length > 1) {
        violations.push({
          id: this.generateViolationId('duplicate_label', ids[0]),
          type: AccessibilityViolationType.DUPLICATE_IDENTIFIER,
          severity: AccessibilitySeverity.MINOR,
          element: {
            identifier: ids[0],
            elementType: 'multiple',
          },
          message: `ContentDescription "${label}" is shared by ${ids.length} interactive elements`,
          wcagCriteria: 'WCAG 2.1 2.4.1',
          recommendation: 'Use unique content descriptions for interactive elements',
          platform: 'android',
        });
      }
    }

    return violations;
  }

  /**
   * Check if node is important for accessibility
   */
  private isImportantNode(node: AccessibilityTreeNode): boolean {
    return Boolean(node.accessible && node.visible);
  }

  /**
   * Check if node contains text
   */
  private containsText(node: AccessibilityTreeNode): boolean {
    return Boolean(
      (node.value && node.value.length > 0) ||
      (node.label && node.label.length > 0) ||
      node.role.toLowerCase().includes('text')
    );
  }

  /**
   * Check if element likely has text value
   */
  private hasTextValue(elem: { role: string }): boolean {
    return elem.role.toLowerCase().includes('text');
  }

  /**
   * Estimate contrast ratio from color strings
   */
  private estimateContrast(foreground: string, background: string): number {
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
    return `android_${type}_${elementId}_${Date.now()}`;
  }
}

/**
 * Create Android accessibility scanner
 */
export function createAndroidA11yScanner(driver: AccessibilityDriver): AndroidA11yScanner {
  return new AndroidA11yScanner(driver);
}
