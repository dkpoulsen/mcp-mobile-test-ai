/**
 * Contrast Analyzer
 *
 * Analyzes color contrast ratios for accessibility compliance with WCAG standards.
 */

import type { ContrastResult } from './types.js';
import { AccessibilityError, AccessibilityErrorType } from './types.js';

/**
 * Calculate relative luminance of a color
 * Based on WCAG 2.0 specification
 */
function calculateLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Parse hex color to RGB
 */
function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  // Remove # if present
  const cleanHex = hex.replace(/^#/, '');

  // Handle 3-character hex
  if (cleanHex.length === 3) {
    return {
      r: parseInt(cleanHex[0] + cleanHex[0], 16),
      g: parseInt(cleanHex[1] + cleanHex[1], 16),
      b: parseInt(cleanHex[2] + cleanHex[2], 16),
    };
  }

  // Handle 6-character hex
  if (cleanHex.length === 6) {
    return {
      r: parseInt(cleanHex.substring(0, 2), 16),
      g: parseInt(cleanHex.substring(2, 4), 16),
      b: parseInt(cleanHex.substring(4, 6), 16),
    };
  }

  return null;
}

/**
 * Parse RGB string to RGB values
 */
function parseRgbString(rgb: string): { r: number; g: number; b: number } | null {
  const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    return {
      r: parseInt(match[1], 10),
      g: parseInt(match[2], 10),
      b: parseInt(match[3], 10),
    };
  }
  return null;
}

/**
 * Convert any color format to RGB
 */
function colorToRgb(color: string): { r: number; g: number; b: number } | null {
  if (!color || color === 'transparent' || color === 'none') {
    return null;
  }

  // Try hex first
  let rgb = parseHexColor(color);
  if (rgb) return rgb;

  // Try rgb/rgba string
  rgb = parseRgbString(color);
  if (rgb) return rgb;

  // Try named colors (basic set)
  const namedColors: Record<string, { r: number; g: number; b: number }> = {
    black: { r: 0, g: 0, b: 0 },
    white: { r: 255, g: 255, b: 255 },
    red: { r: 255, g: 0, b: 0 },
    green: { r: 0, g: 128, b: 0 },
    blue: { r: 0, g: 0, b: 255 },
    yellow: { r: 255, g: 255, b: 0 },
    gray: { r: 128, g: 128, b: 128 },
    grey: { r: 128, g: 128, b: 128 },
    silver: { r: 192, g: 192, b: 192 },
    maroon: { r: 128, g: 0, b: 0 },
    olive: { r: 128, g: 128, b: 0 },
    lime: { r: 0, g: 255, b: 0 },
    aqua: { r: 0, g: 255, b: 255 },
    teal: { r: 0, g: 128, b: 128 },
    navy: { r: 0, g: 0, b: 128 },
    fuchsia: { r: 255, g: 0, b: 255 },
    purple: { r: 128, g: 0, b: 128 },
    orange: { r: 255, g: 165, b: 0 },
  };

  const lowerColor = color.toLowerCase();
  if (namedColors[lowerColor]) {
    return namedColors[lowerColor];
  }

  return null;
}

/**
 * Calculate contrast ratio between two colors
 */
function calculateContrastRatio(
  foreground: { r: number; g: number; b: number },
  background: { r: number; g: number; b: number }
): number {
  const l1 = calculateLuminance(foreground.r, foreground.g, foreground.b);
  const l2 = calculateLuminance(background.r, background.g, background.b);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Contrast Analyzer class
 */
export class ContrastAnalyzer {
  /**
   * Calculate contrast ratio between foreground and background colors
   */
  calculateRatio(
    foreground: string,
    background: string
  ): ContrastResult {
    const fgRgb = colorToRgb(foreground);
    const bgRgb = colorToRgb(background);

    if (!fgRgb || !bgRgb) {
      throw new AccessibilityError(
        AccessibilityErrorType.CONTRAST_FAILED,
        `Invalid color format: foreground="${foreground}", background="${background}"`
      );
    }

    const contrastRatio = calculateContrastRatio(fgRgb, bgRgb);

    // WCAG AA requirements
    const normalTextAA = 4.5;
    const largeTextAA = 3.0;
    const uiComponentsAA = 3.0;

    // WCAG AAA requirements
    const normalTextAAA = 7.0;
    const largeTextAAA = 4.5;

    return {
      backgroundColor: background,
      foregroundColor: foreground,
      contrastRatio: Math.round(contrastRatio * 100) / 100,
      meetsAA: contrastRatio >= normalTextAA,
      meetsAAA: contrastRatio >= normalTextAAA,
      requiredAARatio: normalTextAA,
      requiredAAARatio: normalTextAAA,
    };
  }

  /**
   * Analyze contrast for an element with given styles
   */
  analyzeElement(styles: {
    color?: string;
    backgroundColor?: string;
    fontSize?: string;
    fontWeight?: string;
  }): {
    result: ContrastResult;
    isLargeText: boolean;
    passesAA: boolean;
    passesAAA: boolean;
  } {
    const fg = styles.color || '#000000';
    const bg = styles.backgroundColor || '#ffffff';

    // Determine if text is "large" (18pt+ or 14pt+ bold)
    const fontSize = parseFloat(styles.fontSize || '16');
    const fontWeight = parseInt(styles.fontWeight || '400');
    const isLargeText = fontSize >= 18 || (fontSize >= 14 && fontWeight >= 700);

    const result = this.calculateRatio(fg, bg);

    // Adjust thresholds for large text
    const aaThreshold = isLargeText ? 3.0 : 4.5;
    const aaaThreshold = isLargeText ? 4.5 : 7.0;

    return {
      result: {
        ...result,
        requiredAARatio: aaThreshold,
        requiredAAARatio: aaaThreshold,
        meetsAA: result.contrastRatio >= aaThreshold,
        meetsAAA: result.contrastRatio >= aaaThreshold,
      },
      isLargeText,
      passesAA: result.contrastRatio >= aaThreshold,
      passesAAA: result.contrastRatio >= aaaThreshold,
    };
  }

  /**
   * Analyze contrast from RGB values
   */
  analyzeFromRGB(
    foregroundRGB: { r: number; g: number; b: number },
    backgroundRGB: { r: number; g: number; b: number }
  ): ContrastResult {
    const contrastRatio = calculateContrastRatio(foregroundRGB, backgroundRGB);

    return {
      backgroundColor: `rgb(${backgroundRGB.r}, ${backgroundRGB.g}, ${backgroundRGB.b})`,
      foregroundColor: `rgb(${foregroundRGB.r}, ${foregroundRGB.g}, ${foregroundRGB.b})`,
      contrastRatio: Math.round(contrastRatio * 100) / 100,
      meetsAA: contrastRatio >= 4.5,
      meetsAAA: contrastRatio >= 7.0,
      requiredAARatio: 4.5,
      requiredAAARatio: 7.0,
    };
  }

  /**
   * Get recommended foreground color for given background
   */
  getRecommendedForeground(backgroundColor: string): 'light' | 'dark' {
    const bgRgb = colorToRgb(backgroundColor);
    if (!bgRgb) {
      return 'dark'; // Default to dark text
    }

    // Calculate luminance
    const luminance = calculateLuminance(bgRgb.r, bgRgb.g, bgRgb.b);

    // Use light text on dark backgrounds, dark text on light backgrounds
    return luminance < 0.5 ? 'light' : 'dark';
  }

  /**
   * Validate if contrast meets WCAG AA standard
   */
  meetsWCAGAA(
    foreground: string,
    background: string,
    isLargeText = false
  ): boolean {
    const result = this.calculateRatio(foreground, background);
    const threshold = isLargeText ? 3.0 : 4.5;
    return result.contrastRatio >= threshold;
  }

  /**
   * Validate if contrast meets WCAG AAA standard
   */
  meetsWCAGAAA(
    foreground: string,
    background: string,
    isLargeText = false
  ): boolean {
    const result = this.calculateRatio(foreground, background);
    const threshold = isLargeText ? 4.5 : 7.0;
    return result.contrastRatio >= threshold;
  }
}

/**
 * Create a new contrast analyzer instance
 */
export function createContrastAnalyzer(): ContrastAnalyzer {
  return new ContrastAnalyzer();
}

// Export singleton instance
let globalAnalyzer: ContrastAnalyzer | null = null;

export function getContrastAnalyzer(): ContrastAnalyzer {
  if (!globalAnalyzer) {
    globalAnalyzer = new ContrastAnalyzer();
  }
  return globalAnalyzer;
}

export function resetContrastAnalyzer(): void {
  globalAnalyzer = null;
}
