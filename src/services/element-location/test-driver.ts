/**
 * Test Driver Implementation for Element Location
 * Provides a mock LocationDriver for testing purposes.
 * This can be adapted to work with Playwright for actual testing.
 */

import type {
  ElementHandle,
  LocationDriver,
} from './types.js';

/**
 * Mock element handle for testing
 */
export class MockElementHandle implements ElementHandle {
  constructor(
    private readonly _id: string,
    private readonly _attributes: Record<string, string> = {},
    private readonly _text: string = '',
    private readonly _visible: boolean = true,
    private readonly _enabled: boolean = true
  ) {}

  async click(): Promise<void> {
    // Mock implementation
  }

  async sendKeys(keys: string): Promise<void> {
    // Mock implementation
  }

  async getText(): Promise<string> {
    return this._text;
  }

  async isVisible(): Promise<boolean> {
    return this._visible;
  }

  async isEnabled(): Promise<boolean> {
    return this._enabled;
  }

  async getAttribute(name: string): Promise<string | null> {
    return this._attributes[name] ?? null;
  }

  async screenshot(): Promise<Buffer> {
    return Buffer.from('mock-screenshot');
  }

  get id(): string {
    return this._id;
  }
}

/**
 * Element registry for mock driver
 */
interface ElementRegistry {
  byId: Map<string, MockElementHandle>;
  byXPath: Map<string, MockElementHandle>;
  byAccessibilityId: Map<string, MockElementHandle>;
  byCssSelector: Map<string, MockElementHandle>;
  byText: Map<string, MockElementHandle>;
  byClassName: Map<string, MockElementHandle>;
  byName: Map<string, MockElementHandle>;
  byTagName: Map<string, MockElementHandle>;
  byUIAutomator: Map<string, MockElementHandle>;
  byIosPredicate: Map<string, MockElementHandle>;
  byIosClassChain: Map<string, MockElementHandle>;
}

/**
 * Mock Location Driver for testing
 */
export class MockLocationDriver implements LocationDriver {
  private readonly registry: ElementRegistry = {
    byId: new Map(),
    byXPath: new Map(),
    byAccessibilityId: new Map(),
    byCssSelector: new Map(),
    byText: new Map(),
    byClassName: new Map(),
    byName: new Map(),
    byTagName: new Map(),
    byUIAutomator: new Map(),
    byIosPredicate: new Map(),
    byIosClassChain: new Map(),
  };

  private platform: 'ios' | 'android' | 'web' = 'web';

  /**
   * Register a mock element for testing
   */
  registerElement(
    locatorType: keyof Omit<ElementRegistry, 'byId' | 'byXPath' | 'byUIAutomator' | 'byIosPredicate' | 'byIosClassChain'>,
    value: string,
    element: MockElementHandle
  ): void;
  registerElement(locatorType: 'id', value: string, element: MockElementHandle): void;
  registerElement(locatorType: 'xpath', value: string, element: MockElementHandle): void;
  registerElement(locatorType: 'ui_automator', value: string, element: MockElementHandle): void;
  registerElement(locatorType: 'ios_predicate', value: string, element: MockElementHandle): void;
  registerElement(locatorType: 'ios_class_chain', value: string, element: MockElementHandle): void;
  registerElement(
    locatorType: string,
    value: string,
    element: MockElementHandle
  ): void {
    // Map string locator types to registry keys
    const keyMap: Record<string, keyof ElementRegistry> = {
      'id': 'byId',
      'xpath': 'byXPath',
      'accessibility_id': 'byAccessibilityId',
      'cssSelector': 'byCssSelector',
      'css_selector': 'byCssSelector',
      'text': 'byText',
      'className': 'byClassName',
      'class_name': 'byClassName',
      'name': 'byName',
      'tagName': 'byTagName',
      'tag_name': 'byTagName',
      'ui_automator': 'byUIAutomator',
      'ios_predicate': 'byIosPredicate',
      'ios_class_chain': 'byIosClassChain',
    };

    const key = keyMap[locatorType];
    if (key && key in this.registry) {
      this.registry[key].set(value, element);
    }
  }

  /**
   * Clear all registered elements
   */
  clearElements(): void {
    Object.values(this.registry).forEach((map) => map.clear());
  }

  /**
   * Set the platform for testing
   */
  setPlatform(platform: 'ios' | 'android' | 'web'): void {
    this.platform = platform;
  }

  async findById(id: string): Promise<MockElementHandle | null> {
    return this.registry.byId.get(id) ?? null;
  }

  async findByXPath(xpath: string): Promise<MockElementHandle | null> {
    return this.registry.byXPath.get(xpath) ?? null;
  }

  async findByAccessibilityId(id: string): Promise<MockElementHandle | null> {
    return this.registry.byAccessibilityId.get(id) ?? null;
  }

  async findByCssSelector(selector: string): Promise<MockElementHandle | null> {
    return this.registry.byCssSelector.get(selector) ?? null;
  }

  async findByText(text: string): Promise<MockElementHandle | null> {
    return this.registry.byText.get(text) ?? null;
  }

  async findByClassName(className: string): Promise<MockElementHandle | null> {
    return this.registry.byClassName.get(className) ?? null;
  }

  async findByName(name: string): Promise<MockElementHandle | null> {
    return this.registry.byName.get(name) ?? null;
  }

  async findByTagName(tagName: string): Promise<MockElementHandle | null> {
    return this.registry.byTagName.get(tagName) ?? null;
  }

  async findByCustom(_locator: string): Promise<MockElementHandle | null> {
    return null;
  }

  async findByUIAutomator(selector: string): Promise<MockElementHandle | null> {
    return this.registry.byUIAutomator.get(selector) ?? null;
  }

  async findByIosPredicate(predicate: string): Promise<MockElementHandle | null> {
    return this.registry.byIosPredicate.get(predicate) ?? null;
  }

  async findByIosClassChain(chain: string): Promise<MockElementHandle | null> {
    return this.registry.byIosClassChain.get(chain) ?? null;
  }

  async getPlatform(): Promise<'ios' | 'android' | 'web'> {
    return this.platform;
  }
}

/**
 * Create a mock location driver with sample elements for testing
 */
export function createMockDriver(): MockLocationDriver {
  const driver = new MockLocationDriver();

  // Register some sample elements
  const submitButton = new MockElementHandle(
    'submit-btn',
    { id: 'submit-btn', class: 'btn btn-primary', type: 'submit' },
    'Submit',
    true,
    true
  );

  const cancelButton = new MockElementHandle(
    'cancel-btn',
    { id: 'cancel-btn', class: 'btn btn-secondary', type: 'button' },
    'Cancel',
    true,
    true
  );

  const loginButton = new MockElementHandle(
    'login-btn',
    { id: 'login-btn', class: 'btn', type: 'button' },
    'Login',
    true,
    true
  );

  // Register by ID
  driver.registerElement('id', 'submit-btn', submitButton);
  driver.registerElement('id', 'cancel-btn', cancelButton);
  driver.registerElement('id', 'login-btn', loginButton);

  // Register by CSS selector
  driver.registerElement('cssSelector', '#submit-btn', submitButton);
  driver.registerElement('cssSelector', '.btn-primary', submitButton);
  driver.registerElement('cssSelector', '#cancel-btn', cancelButton);
  driver.registerElement('cssSelector', '#login-btn', loginButton);

  // Register by text
  driver.registerElement('text', 'Submit', submitButton);
  driver.registerElement('text', 'Cancel', cancelButton);
  driver.registerElement('text', 'Login', loginButton);

  // Register by class
  driver.registerElement('className', 'btn-primary', submitButton);
  driver.registerElement('className', 'btn-secondary', cancelButton);
  driver.registerElement('className', 'btn', loginButton);

  // Register by name
  driver.registerElement('name', 'submit', submitButton);
  driver.registerElement('name', 'cancel', cancelButton);
  driver.registerElement('name', 'login', loginButton);

  // Register by accessibility ID
  driver.registerElement('accessibility_id', 'submit_btn', submitButton);
  driver.registerElement('accessibility_id', 'cancel_btn', cancelButton);
  driver.registerElement('accessibility_id', 'login_btn', loginButton);

  // Register some XPath examples
  driver.registerElement('xpath', "//button[@id='submit-btn']", submitButton);
  driver.registerElement('xpath', "//button[@id='cancel-btn']", cancelButton);
  driver.registerElement('xpath', "//button[@id='login-btn']", loginButton);
  driver.registerElement('xpath', "//button[contains(text(), 'Submit')]", submitButton);
  driver.registerElement('xpath', "//button[contains(text(), 'Cancel')]", cancelButton);
  driver.registerElement('xpath', "//button[contains(text(), 'Login')]", loginButton);

  return driver;
}
