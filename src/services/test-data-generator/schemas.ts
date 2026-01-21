/**
 * Predefined Data Schemas for Test Data Generation
 * Common schemas for generating realistic test data
 */

import { z } from 'zod';
import type { DataSchema } from './types.js';

/**
 * Schema for generating person names
 */
export const nameSchema: DataSchema<string> = {
  name: 'name',
  description: 'A person\'s full name including first and last name',
  schema: z.string().min(1).max(100),
  examples: ['John Smith', 'Maria Garcia', 'Chen Wei', 'Aisha Patel'],
  constraints: {
    minLength: 1,
    maxLength: 100,
  },
};

/**
 * Schema for generating email addresses
 */
export const emailSchema: DataSchema<string> = {
  name: 'email',
  description: 'A valid email address',
  schema: z.string().email(),
  examples: [
    'john.smith@example.com',
    'maria.garcia@company.co.uk',
    'user123@domain.org',
  ],
  constraints: {
    pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
  },
};

/**
 * Schema for generating phone numbers
 */
export const phoneSchema: DataSchema<string> = {
  name: 'phone',
  description: 'A phone number in various formats',
  schema: z.string().min(10).max(20),
  examples: [
    '+1 (555) 123-4567',
    '+44 20 7123 4567',
    '555-123-4567',
    '+1 555.123.4567',
  ],
  constraints: {
    minLength: 10,
    maxLength: 20,
  },
};

/**
 * Schema for generating street addresses
 */
export const addressSchema: DataSchema<{
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}> = {
  name: 'address',
  description: 'A complete street address with city, state, postal code, and country',
  schema: z.object({
    street: z.string().min(1).max(200),
    city: z.string().min(1).max(100),
    state: z.string().min(1).max(100),
    postalCode: z.string().min(1).max(20),
    country: z.string().min(1).max(100),
  }),
  examples: [
    {
      street: '123 Main Street',
      city: 'Springfield',
      state: 'IL',
      postalCode: '62701',
      country: 'USA',
    },
    {
      street: '456 High Street',
      city: 'London',
      state: 'England',
      postalCode: 'SW1A 1AA',
      country: 'UK',
    },
  ],
  fields: {
    street: {
      description: 'Street address including building number and street name',
      type: 'string',
      required: true,
      examples: ['123 Main Street', '456 Oak Avenue', '789 Broadway'],
    },
    city: {
      description: 'Name of the city',
      type: 'string',
      required: true,
      examples: ['Springfield', 'New York', 'London', 'Tokyo'],
    },
    state: {
      description: 'State, province, or region',
      type: 'string',
      required: true,
      examples: ['CA', 'Texas', 'Bavaria', 'Ontario'],
    },
    postalCode: {
      description: 'Postal or ZIP code',
      type: 'string',
      required: true,
      examples: ['90210', 'SW1A 1AA', '12345', 'M5V 3L8'],
    },
    country: {
      description: 'Country name or code',
      type: 'string',
      required: true,
      examples: ['USA', 'UK', 'Canada', 'Germany', 'Japan'],
    },
  },
};

/**
 * Schema for generating company names
 */
export const companySchema: DataSchema<string> = {
  name: 'company',
  description: 'A company or organization name',
  schema: z.string().min(1).max(200),
  examples: [
    'Acme Corporation',
    'Tech Innovations Ltd',
    'Global Solutions Inc',
    'Smith & Associates',
  ],
  constraints: {
    minLength: 1,
    maxLength: 200,
  },
};

/**
 * Schema for generating user profiles
 */
export const userProfileSchema: DataSchema<{
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  age: number;
  address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  company?: string;
  website?: string;
  isActive: boolean;
  registeredAt: string;
}> = {
  name: 'userProfile',
  description: 'A complete user profile with personal information',
  schema: z.object({
    id: z.string().uuid(),
    firstName: z.string().min(1).max(50),
    lastName: z.string().min(1).max(50),
    email: z.string().email(),
    phone: z.string().min(10).max(20),
    age: z.number().int().min(18).max(120),
    address: z.object({
      street: z.string().min(1).max(200),
      city: z.string().min(1).max(100),
      state: z.string().min(1).max(100),
      postalCode: z.string().min(1).max(20),
      country: z.string().min(1).max(100),
    }),
    company: z.string().max(200).optional(),
    website: z.string().url().optional(),
    isActive: z.boolean(),
    registeredAt: z.string().datetime(),
  }),
  examples: [
    {
      id: '550e8400-e29b-41d4-a716-446655440000',
      firstName: 'John',
      lastName: 'Smith',
      email: 'john.smith@example.com',
      phone: '+1 (555) 123-4567',
      age: 32,
      address: {
        street: '123 Main Street',
        city: 'Springfield',
        state: 'IL',
        postalCode: '62701',
        country: 'USA',
      },
      company: 'Acme Corporation',
      website: 'https://www.example.com',
      isActive: true,
      registeredAt: '2023-01-15T10:30:00Z',
    },
  ],
};

/**
 * Schema for generating credit card numbers (test only)
 */
export const creditCardSchema: DataSchema<{
  cardNumber: string;
  cardHolder: string;
  expiryDate: string;
  cvv: string;
  cardType: string;
}> = {
  name: 'creditCard',
  description: 'Test credit card information (for testing only, not real cards)',
  schema: z.object({
    cardNumber: z.string().min(13).max(19),
    cardHolder: z.string().min(1).max(100),
    expiryDate: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/),
    cvv: z.string().regex(/^\d{3,4}$/),
    cardType: z.enum(['Visa', 'MasterCard', 'American Express', 'Discover']),
  }),
  examples: [
    {
      cardNumber: '4111111111111111',
      cardHolder: 'John Smith',
      expiryDate: '12/25',
      cvv: '123',
      cardType: 'Visa',
    },
  ],
};

/**
 * Schema for generating dates
 */
export const dateSchema: DataSchema<string> = {
  name: 'date',
  description: 'A date in ISO 8601 format (YYYY-MM-DD)',
  schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  examples: ['2023-01-15', '1995-12-25', '2024-07-04'],
  constraints: {
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  },
};

/**
 * Schema for generating URLs
 */
export const urlSchema: DataSchema<string> = {
  name: 'url',
  description: 'A valid URL',
  schema: z.string().url(),
  examples: [
    'https://www.example.com',
    'https://api.example.com/v1/users',
    'https://blog.example.com/post/123',
  ],
};

/**
 * Schema for generating UUIDs
 */
export const uuidSchema: DataSchema<string> = {
  name: 'uuid',
  description: 'A UUID v4 string',
  schema: z.string().uuid(),
  examples: [
    '550e8400-e29b-41d4-a716-446655440000',
    'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  ],
};

/**
 * Schema for generating product information
 */
export const productSchema: DataSchema<{
  id: string;
  name: string;
  description: string;
  price: number;
  sku: string;
  category: string;
  inStock: boolean;
  quantity: number;
}> = {
  name: 'product',
  description: 'Product information for e-commerce',
  schema: z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(200),
    description: z.string().min(1).max(1000),
    price: z.number().positive(),
    sku: z.string().min(1).max(50),
    category: z.string().min(1).max(100),
    inStock: z.boolean(),
    quantity: z.number().int().min(0),
  }),
  examples: [
    {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Wireless Bluetooth Headphones',
      description: 'High-quality wireless headphones with noise cancellation',
      price: 79.99,
      sku: 'WBH-001-BLK',
      category: 'Electronics',
      inStock: true,
      quantity: 150,
    },
  ],
};

/**
 * Schema for generating social media posts
 */
export const socialPostSchema: DataSchema<{
  id: string;
  author: string;
  content: string;
  hashtags: string[];
  likes: number;
  shares: number;
  createdAt: string;
}> = {
  name: 'socialPost',
  description: 'A social media post with engagement metrics',
  schema: z.object({
    id: z.string().uuid(),
    author: z.string().min(1).max(100),
    content: z.string().min(1).max(500),
    hashtags: z.array(z.string().regex(/^#[a-zA-Z0-9_]+$/)).min(0).max(10),
    likes: z.number().int().min(0),
    shares: z.number().int().min(0),
    createdAt: z.string().datetime(),
  }),
  examples: [
    {
      id: '550e8400-e29b-41d4-a716-446655440000',
      author: 'tech_enthusiast',
      content: 'Just tried out the new AI coding assistant and it\'s amazing! #AI #Tech',
      hashtags: ['#AI', '#Tech'],
      likes: 42,
      shares: 5,
      createdAt: '2024-01-15T14:30:00Z',
    },
  ],
};

/**
 * Registry of all predefined schemas
 */
export const schemaRegistry: Record<string, DataSchema> = {
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  address: addressSchema,
  company: companySchema,
  userProfile: userProfileSchema,
  creditCard: creditCardSchema,
  date: dateSchema,
  url: urlSchema,
  uuid: uuidSchema,
  product: productSchema,
  socialPost: socialPostSchema,
};

/**
 * Get a schema by name
 */
export function getSchema(name: string): DataSchema | undefined {
  return schemaRegistry[name];
}

/**
 * Check if a schema exists
 */
export function hasSchema(name: string): boolean {
  return name in schemaRegistry;
}

/**
 * Get all available schema names
 */
export function getSchemaNames(): string[] {
  return Object.keys(schemaRegistry);
}
