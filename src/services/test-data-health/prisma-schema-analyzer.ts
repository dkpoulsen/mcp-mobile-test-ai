/**
 * Prisma Schema Analyzer
 * Analyzes Prisma schema to understand model relationships and constraints
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-base-to-string */

import type { PrismaClient } from '@prisma/client';
import type { DataIssue, IssueType } from './types.js';

/**
 * Schema metadata for a Prisma model
 */
export interface ModelMetadata {
  /** Model name */
  name: string;

  /** Fields in the model */
  fields: FieldMetadata[];

  /** Relations to other models */
  relations: RelationMetadata[];

  /** Primary key field(s) */
  primaryKeys: string[];

  /** Unique constraints */
  uniqueConstraints: string[][];

  /** Required fields */
  requiredFields: string[];

  /** Enum fields */
  enumFields: Record<string, string[]>;

  /** Array fields */
  arrayFields: string[];

  /** Has createdAt field */
  hasCreatedAt: boolean;

  /** Has updatedAt field */
  hasUpdatedAt: boolean;

  /** Timestamp fields */
  timestampFields: string[];
}

/**
 * Field metadata
 */
export interface FieldMetadata {
  /** Field name */
  name: string;

  /** Field type */
  type: string;

  /** Whether field is required (not null) */
  isRequired: boolean;

  /** Whether field is unique */
  isUnique: boolean;

  /** Whether field is an ID */
  isId: boolean;

  /** Whether field is a relation */
  isRelation: boolean;

  /** Default value */
  hasDefault: boolean;

  /** Is list/array type */
  isList: boolean;

  /** Enum name if this is an enum field */
  enumName?: string;

  /** Related model if this is a relation */
  relatedModel?: string;
}

/**
 * Relation metadata
 */
export interface RelationMetadata {
  /** Field name */
  name: string;

  /** Related model */
  relatedModel: string;

  /** Relation type */
  type: 'oneToOne' | 'oneToMany' | 'manyToMany';

  /** Foreign key field */
  foreignKey?: string;

  /** Whether relation is required */
  isRequired: boolean;

  /** On delete behavior */
  onDelete?: string;
}

/**
 * Schema validation result
 */
export interface SchemaValidationResult {
  /** Model name */
  model: string;

  /** Is schema valid */
  isValid: boolean;

  /** Issues found */
  issues: DataIssue[];

  /** Constraints checked */
  constraintsChecked: string[];
}

/**
 * Prisma Schema Analyzer class
 * Analyzes Prisma schema for model metadata and relationships
 */
export class PrismaSchemaAnalyzer {
  private readonly metadataCache = new Map<string, ModelMetadata>();

  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Get metadata for a Prisma model
   */
  getModelMetadata(modelName: string): ModelMetadata {
    if (this.metadataCache.has(modelName)) {
      return this.metadataCache.get(modelName)!;
    }

    const metadata = this.buildModelMetadata(modelName);
    this.metadataCache.set(modelName, metadata);
    return metadata;
  }

  /**
   * Get metadata for all models
   */
  getAllModelMetadata(): Record<string, ModelMetadata> {
    const result: Record<string, ModelMetadata> = {};

    // Get all model names from Prisma
    const models = this.getModelNames();
    for (const model of models) {
      result[model] = this.getModelMetadata(model);
    }

    return result;
  }

  /**
   * Build metadata for a model by inspecting its schema
   */
  private buildModelMetadata(modelName: string): ModelMetadata {
    // Use Prisma's DMMF (Data Model Metadata Format)
    const datamodel = (this.prisma as unknown as { _dmmf: { datamodel: { models: unknown[] } } })._dmmf
      .datamodel;

    const modelData = datamodel.models.find((m: any) => m.name === modelName);
    if (!modelData) {
      throw new Error(`Model not found: ${modelName}`);
    }

    const fields: FieldMetadata[] = modelData.fields.map((f: any) => ({
      name: f.name,
      type: f.type,
      isRequired: f.isRequired,
      isUnique: f.isUnique,
      isId: f.isId,
      isRelation: f.isRelation || !!f.relationName,
      hasDefault: f.hasDefault,
      isList: f.isList,
      enumName: f.kind === 'enum' ? f.type : undefined,
      relatedModel: f.relationName ? (f).type : undefined,
    }));

    const primaryKeys: string[] = modelData.primaryKey?.fields?.map((f: any) => f.name) ?? [];
    const uniqueConstraints: string[][] = modelData.uniqueFields?.map((uf: any[]) => uf.map((f: any) => f.name)) ?? [];

    const requiredFields = fields.filter((f) => f.isRequired && !f.hasDefault && !f.isId).map((f) => f.name);

    const enumFields: Record<string, string[]> = {};
    for (const field of fields) {
      if (field.enumName) {
        const enumData = datamodel.enums.find((e: any) => e.name === field.enumName);
        if (enumData) {
          enumFields[field.name] = enumData.values.map((v: any) => v.name);
        }
      }
    }

    const arrayFields = fields.filter((f) => f.isList).map((f) => f.name);

    const timestampFields = fields.filter((f) => {
      const type = f.type.toLowerCase();
      return type === 'datetime' || type === 'date' || type === 'time';
    }).map((f) => f.name);

    const relations: RelationMetadata[] = [];
    for (const field of fields) {
      if (field.isRelation && field.relatedModel) {
        // Determine relation type
        const relatedModelData = datamodel.models.find((m: any) => m.name === field.relatedModel);
        const hasBackRelation = relatedModelData?.fields.some((f: any) =>
          f.relationName === modelData.fields.find((mf: any) => mf.name === field.name)?.relationName &&
          f.name !== field.name
        );

        let type: 'oneToOne' | 'oneToMany' | 'manyToMany' = 'oneToOne';
        if (field.isList) {
          type = 'manyToMany';
        } else if (hasBackRelation) {
          const backField = relatedModelData?.fields.find((f: any) =>
            f.relationName === modelData.fields.find((mf: any) => mf.name === field.name)?.relationName &&
            f.name !== field.name
          );
          type = backField.isList ? 'oneToMany' : 'oneToOne';
        }

        relations.push({
          name: field.name,
          relatedModel: field.relatedModel,
          type,
          isRequired: field.isRequired,
        });
      }
    }

    return {
      name: modelName,
      fields,
      relations,
      primaryKeys,
      uniqueConstraints,
      requiredFields,
      enumFields,
      arrayFields,
      hasCreatedAt: fields.some((f) => f.name.toLowerCase() === 'createdat'),
      hasUpdatedAt: fields.some((f) => f.name.toLowerCase() === 'updatedat'),
      timestampFields,
    };
  }

  /**
   * Get all model names from Prisma schema
   */
  getModelNames(): string[] {
    const datamodel = (this.prisma as unknown as { _dmmf: { datamodel: { models: { name: string }[] } } })._dmmf
      .datamodel;
    return datamodel.models.map((m: any) => m.name);
  }

  /**
   * Validate a record against its schema constraints
   */
  validateRecord(modelName: string, record: Record<string, unknown>): SchemaValidationResult {
    const metadata = this.getModelMetadata(modelName);
    const issues: DataIssue[] = [];
    const constraintsChecked: string[] = [];

    // Check required fields
    for (const field of metadata.requiredFields) {
      constraintsChecked.push(`required:${field}`);
      if (record[field] === null || record[field] === undefined) {
        issues.push({
          type: 'NULL_REQUIRED' as IssueType,
          description: `Required field '${field}' is null or undefined`,
          field,
          recordId: String(record[metadata.primaryKeys[0]] ?? 'unknown'),
        });
      }
    }

    // Check enum values
    for (const [field, validValues] of Object.entries(metadata.enumFields)) {
      constraintsChecked.push(`enum:${field}`);
      const value = record[field];
      if (value !== null && value !== undefined && !validValues.includes(String(value))) {
        issues.push({
          type: 'INVALID_ENUM' as IssueType,
          description: `Invalid enum value for '${field}'`,
          field,
          expected: validValues.join(', '),
          actual: String(value),
        });
      }
    }

    // Check array types
    for (const field of metadata.arrayFields) {
      constraintsChecked.push(`array:${field}`);
      const value = record[field];
      if (value !== null && value !== undefined && !Array.isArray(value)) {
        issues.push({
          type: 'INVALID_FORMAT' as IssueType,
          description: `Field '${field}' should be an array`,
          field,
          actual: typeof value,
        });
      }
    }

    return {
      model: modelName,
      isValid: issues.length === 0,
      issues,
      constraintsChecked,
    };
  }

  /**
   * Get models in dependency order (parents before children)
   */
  getModelsInDependencyOrder(): string[] {
    const metadata = this.getAllModelMetadata();
    const models = Object.keys(metadata);
    const sorted: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (model: string): void => {
      if (visited.has(model)) return;
      if (visiting.has(model)) {
        // Circular dependency - skip for now
        return;
      }

      visiting.add(model);

      // Visit dependencies first (models that this model depends on via foreign keys)
      const modelMeta = metadata[model];
      for (const relation of modelMeta.relations) {
        if (relation.type === 'oneToMany' || relation.type === 'manyToMany') {
          // This is a "many" side, depends on the "one" side
          visit(relation.relatedModel);
        }
      }

      visiting.delete(model);
      visited.add(model);
      sorted.push(model);
    };

    for (const model of models) {
      visit(model);
    }

    return sorted;
  }

  /**
   * Get foreign key relationships for a model
   */
  getForeignKeyRelations(modelName: string): Array<{ field: string; relatedModel: string; isRequired: boolean }> {
    const metadata = this.getModelMetadata(modelName);
    const result: Array<{ field: string; relatedModel: string; isRequired: boolean }> = [];

    for (const field of metadata.fields) {
      if (field.isRelation && field.relatedModel) {
        // Find the actual foreign key field (usually ends with Id)
        const fkField = metadata.fields.find((f) =>
          f.name.toLowerCase() === `${field.name.toLowerCase()}id` ||
          (field.relatedModel.toLowerCase() + 'id') === f.name.toLowerCase()
        );

        if (fkField) {
          result.push({
            field: fkField.name,
            relatedModel: field.relatedModel,
            isRequired: fkField.isRequired,
          });
        }
      }
    }

    return result;
  }

  /**
   * Clear the metadata cache (useful for testing)
   */
  clearCache(): void {
    this.metadataCache.clear();
  }
}
