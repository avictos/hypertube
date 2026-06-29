import fs from "node:fs";
import path from "node:path";

type ColumnMeta = {
    name: string;
    type: string;
    notNull: boolean;
    primaryKey: boolean;
    unique: boolean;
    defaultValue?: string;
    references?: {
        table: string;
        columns: string[];
        onDelete?: string;
    };
    checks: string[];
};

type TableConstraint =
    | {
          type: "unique";
          columns: string[];
      }
    | {
          type: "primaryKey";
          columns: string[];
      }
    | {
          type: "foreignKey";
          columns: string[];
          referencesTable: string;
          referencesColumns: string[];
          onDelete?: string;
      }
    | {
          type: "check";
          expression: string;
      };

type TableMeta = {
    name: string;
    columns: ColumnMeta[];
    constraints: TableConstraint[];
};

type RelationMeta = {
    relationName: string;
    tableName: string;
    localKey: string;
    foreignKey: string;
    typeName: string;
};

const INPUT_SCHEMA_PATH = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(process.cwd(), "src/db/schema.sql");

const ORM_DIR = path.resolve(process.cwd(), "src/lib/db/orm");
const DB_TYPES_PATH = path.join(ORM_DIR, "db-types.ts");
const CLIENT_PATH = path.join(ORM_DIR, "client.ts");

const readSchema = (): string => {
    if (!fs.existsSync(INPUT_SCHEMA_PATH)) {
        throw new Error(`Schema file not found: ${INPUT_SCHEMA_PATH}`);
    }

    return fs.readFileSync(INPUT_SCHEMA_PATH, "utf8").replace(/--.*$/gm, "");
};

const splitTopLevel = (input: string): string[] => {
    const parts: string[] = [];
    let current = "";
    let depth = 0;
    let inSingleQuote = false;

    for (let index = 0; index < input.length; index++) {
        const char = input[index];
        const next = input[index + 1];

        if (char === "'" && !inSingleQuote) {
            inSingleQuote = true;
            current += char;
            continue;
        }

        if (char === "'" && inSingleQuote) {
            current += char;
            if (next === "'") {
                current += next;
                index++;
            } else {
                inSingleQuote = false;
            }
            continue;
        }

        if (!inSingleQuote) {
            if (char === "(") depth++;
            if (char === ")") depth = Math.max(0, depth - 1);

            if (char === "," && depth === 0) {
                if (current.trim()) {
                    parts.push(current.trim());
                }
                current = "";
                continue;
            }
        }

        current += char;
    }

    if (current.trim()) {
        parts.push(current.trim());
    }

    return parts;
};

const findKeywordIndex = (value: string, keywords: string[]): number => {
    let best = -1;

    for (const keyword of keywords) {
        const match = value.match(new RegExp(`\\b${keyword}\\b`, "i"));
        if (!match || match.index === undefined) continue;
        if (best === -1 || match.index < best) {
            best = match.index;
        }
    }

    return best;
};

const extractBalanced = (
    value: string,
    openIndex: number
): { content: string; endIndex: number } => {
    let depth = 0;
    let inSingleQuote = false;

    for (let index = openIndex; index < value.length; index++) {
        const char = value[index];
        const next = value[index + 1];

        if (char === "'" && !inSingleQuote) {
            inSingleQuote = true;
            continue;
        }

        if (char === "'" && inSingleQuote) {
            if (next === "'") {
                index++;
                continue;
            }

            inSingleQuote = false;
            continue;
        }

        if (inSingleQuote) continue;

        if (char === "(") depth++;
        if (char === ")") {
            depth--;
            if (depth === 0) {
                return {
                    content: value.slice(openIndex + 1, index),
                    endIndex: index,
                };
            }
        }
    }

    throw new Error(`Unbalanced parentheses in: ${value}`);
};

const trimTrailingSemicolon = (value: string): string => value.replace(/;\s*$/, "").trim();

const camelCase = (value: string): string => {
    const parts = value.split("_").filter(Boolean);
    if (parts.length === 0) return value;

    return parts
        .map((part, index) => {
            const normalized = part.toLowerCase();
            if (index === 0) return normalized;
            return normalized.charAt(0).toUpperCase() + normalized.slice(1);
        })
        .join("");
};

const pascalCase = (value: string): string => {
    const camel = camelCase(value);
    return camel.charAt(0).toUpperCase() + camel.slice(1);
};

const tableConstantNameFromTable = (tableName: string): string => pascalCase(tableName);

const rowTypeNameFromTable = (tableName: string): string => pascalCase(singularize(tableName));

const singularize = (value: string): string => {
    if (value.endsWith("ies")) return `${value.slice(0, -3)}y`;
    if (value.endsWith("ses")) return value.slice(0, -2);
    if (value.endsWith("s") && value.length > 1) return value.slice(0, -1);
    return value;
};

const quote = (value: string): string => JSON.stringify(value);

const normalizeSqlType = (value: string): string => value.trim().replace(/\s+/g, " ").toUpperCase();

const splitColumnList = (value: string): string[] =>
    value
        .split(",")
        .map((entry) => entry.trim().replace(/"/g, ""))
        .filter(Boolean);

const parseColumnDefinition = (definition: string): ColumnMeta => {
    const columnMatch = definition.match(/^([a-zA-Z_][\w]*)\s+([\s\S]+)$/);
    if (!columnMatch) {
        throw new Error(`Invalid column definition: ${definition}`);
    }

    const name = columnMatch[1];
    const tail = columnMatch[2].trim();
    const keywordIndex = findKeywordIndex(tail, [
        "NOT NULL",
        "NULL",
        "DEFAULT",
        "PRIMARY KEY",
        "UNIQUE",
        "REFERENCES",
        "CHECK",
    ]);

    const type = (keywordIndex === -1 ? tail : tail.slice(0, keywordIndex)).trim();
    let remainder = keywordIndex === -1 ? "" : tail.slice(keywordIndex).trim();

    const column: ColumnMeta = {
        name,
        type,
        notNull: false,
        primaryKey: false,
        unique: false,
        checks: [],
    };

    while (remainder.length > 0) {
        if (/^NOT NULL\b/i.test(remainder)) {
            column.notNull = true;
            remainder = remainder.replace(/^NOT NULL\b/i, "").trim();
            continue;
        }

        if (/^NULL\b/i.test(remainder)) {
            remainder = remainder.replace(/^NULL\b/i, "").trim();
            continue;
        }

        if (/^DEFAULT\b/i.test(remainder)) {
            const defaultMatch = remainder.match(
                /^DEFAULT\b\s+([\s\S]+?)(?=\s+(?:NOT NULL|NULL|PRIMARY KEY|UNIQUE|REFERENCES|CHECK)\b|$)/i
            );
            if (!defaultMatch) {
                throw new Error(`Invalid DEFAULT clause in: ${definition}`);
            }

            column.defaultValue = defaultMatch[1].trim();
            remainder = remainder.slice(defaultMatch[0].length).trim();
            continue;
        }

        if (/^PRIMARY KEY\b/i.test(remainder)) {
            column.primaryKey = true;
            remainder = remainder.replace(/^PRIMARY KEY\b/i, "").trim();
            continue;
        }

        if (/^UNIQUE\b/i.test(remainder)) {
            column.unique = true;
            remainder = remainder.replace(/^UNIQUE\b/i, "").trim();
            continue;
        }

        if (/^REFERENCES\b/i.test(remainder)) {
            const referencesMatch = remainder.match(/^REFERENCES\b\s+([a-zA-Z_][\w]*)\s*\(/i);
            if (!referencesMatch || referencesMatch.index === undefined) {
                throw new Error(`Invalid REFERENCES clause in: ${definition}`);
            }

            const refTable = referencesMatch[1];
            const openIndex = remainder.indexOf("(", referencesMatch[0].length - 1);
            if (openIndex === -1) {
                throw new Error(`Invalid REFERENCES column list in: ${definition}`);
            }

            const refColumns = extractBalanced(remainder, openIndex);
            column.references = {
                table: refTable,
                columns: splitColumnList(refColumns.content),
            };

            const after = remainder.slice(refColumns.endIndex + 1).trim();
            const onDeleteMatch = after.match(
                /^ON DELETE\b\s+([A-Z ]+?)(?=\s+(?:NOT NULL|NULL|DEFAULT|PRIMARY KEY|UNIQUE|REFERENCES|CHECK)\b|$)/i
            );
            if (onDeleteMatch) {
                column.references.onDelete = onDeleteMatch[1].trim().toUpperCase();
                remainder = after.slice(onDeleteMatch[0].length).trim();
            } else {
                remainder = after;
            }
            continue;
        }

        if (/^CHECK\b/i.test(remainder)) {
            const openIndex = remainder.indexOf("(");
            if (openIndex === -1) {
                throw new Error(`Invalid CHECK clause in: ${definition}`);
            }

            const check = extractBalanced(remainder, openIndex);
            column.checks.push(check.content.trim());
            remainder = remainder.slice(check.endIndex + 1).trim();
            continue;
        }

        break;
    }

    return column;
};

const parseTableConstraint = (definition: string): TableConstraint => {
    const normalized = trimTrailingSemicolon(definition);

    const uniqueMatch = normalized.match(
        /^(?:CONSTRAINT\s+[a-zA-Z_][\w]*\s+)?UNIQUE\s*\(([^)]+)\)$/i
    );
    if (uniqueMatch) {
        return {
            type: "unique",
            columns: splitColumnList(uniqueMatch[1]),
        };
    }

    const primaryKeyMatch = normalized.match(
        /^(?:CONSTRAINT\s+[a-zA-Z_][\w]*\s+)?PRIMARY KEY\s*\(([^)]+)\)$/i
    );
    if (primaryKeyMatch) {
        return {
            type: "primaryKey",
            columns: splitColumnList(primaryKeyMatch[1]),
        };
    }

    const foreignKeyMatch = normalized.match(
        /^(?:CONSTRAINT\s+[a-zA-Z_][\w]*\s+)?FOREIGN KEY\s*\(([^)]+)\)\s+REFERENCES\s+([a-zA-Z_][\w]*)\s*\(([^)]+)\)(?:\s+ON DELETE\s+([A-Z ]+))?$/i
    );
    if (foreignKeyMatch) {
        return {
            type: "foreignKey",
            columns: splitColumnList(foreignKeyMatch[1]),
            referencesTable: foreignKeyMatch[2],
            referencesColumns: splitColumnList(foreignKeyMatch[3]),
            onDelete: foreignKeyMatch[4]?.trim().toUpperCase(),
        };
    }

    const checkMatch = normalized.match(
        /^(?:CONSTRAINT\s+[a-zA-Z_][\w]*\s+)?CHECK\s*\(([\s\S]+)\)$/i
    );
    if (checkMatch) {
        return {
            type: "check",
            expression: checkMatch[1].trim(),
        };
    }

    throw new Error(`Unsupported table constraint: ${definition}`);
};

const parseTables = (schema: string): TableMeta[] => {
    const tables: TableMeta[] = [];
    const tableRegex = /CREATE TABLE\s+([a-zA-Z_][\w]*)\s*\(([\s\S]*?)\);/gi;
    let match: RegExpExecArray | null;

    while ((match = tableRegex.exec(schema))) {
        const name = match[1];
        const body = match[2];
        const parts = splitTopLevel(body);
        const columns: ColumnMeta[] = [];
        const constraints: TableConstraint[] = [];

        for (const part of parts) {
            if (/^(CONSTRAINT\b|PRIMARY KEY\b|UNIQUE\b|FOREIGN KEY\b|CHECK\b)/i.test(part)) {
                constraints.push(parseTableConstraint(part));
            } else {
                columns.push(parseColumnDefinition(part));
            }
        }

        tables.push({ name, columns, constraints });
    }

    return tables;
};

const uniqueFieldsForTable = (table: TableMeta): string[] => {
    const uniqueFields = new Set<string>();

    for (const column of table.columns) {
        if (column.primaryKey || column.unique) {
            uniqueFields.add(column.name);
        }
    }

    for (const constraint of table.constraints) {
        if (constraint.type === "unique" && constraint.columns.length === 1) {
            uniqueFields.add(constraint.columns[0]);
        }

        if (constraint.type === "primaryKey" && constraint.columns.length === 1) {
            uniqueFields.add(constraint.columns[0]);
        }
    }

    return [...uniqueFields];
};

const compositeUniqueFieldsForTable = (table: TableMeta): string[][] => {
    return table.constraints
        .filter(
            (
                constraint
            ): constraint is Extract<TableConstraint, { type: "unique" | "primaryKey" }> =>
                (constraint.type === "unique" || constraint.type === "primaryKey") &&
                constraint.columns.length > 1
        )
        .map((constraint) => constraint.columns);
};

const foreignKeysForTable = (
    table: TableMeta
): Extract<TableConstraint, { type: "foreignKey" }>[] => {
    const foreignKeys = table.constraints.filter(
        (constraint): constraint is Extract<TableConstraint, { type: "foreignKey" }> =>
            constraint.type === "foreignKey"
    );

    for (const column of table.columns) {
        if (column.references) {
            foreignKeys.push({
                type: "foreignKey",
                columns: [column.name],
                referencesTable: column.references.table,
                referencesColumns: column.references.columns,
                onDelete: column.references.onDelete,
            });
        }
    }

    return foreignKeys;
};

const getColumn = (table: TableMeta, name: string): ColumnMeta | undefined =>
    table.columns.find((column) => column.name === name);

const relationNameFromTable = (tableName: string): string => camelCase(singularize(tableName));

const buildRelations = (tables: TableMeta[]): Map<string, RelationMeta[]> => {
    const relations = new Map<string, RelationMeta[]>();

    for (const table of tables) {
        relations.set(table.name, []);
    }

    const groups = new Map<
        string,
        {
            parentTable: TableMeta;
            columns: string[];
            members: Array<{ table: TableMeta; localKey: string; foreignKey: string }>;
        }
    >();

    for (const sourceTable of tables) {
        const foreignKeys = foreignKeysForTable(sourceTable);

        for (const foreignKey of foreignKeys) {
            const targetTable = tables.find((table) => table.name === foreignKey.referencesTable);
            if (!targetTable) continue;

            const groupKey = `${targetTable.name}:${foreignKey.referencesColumns.join(",")}`;
            const group = groups.get(groupKey) || {
                parentTable: targetTable,
                columns: foreignKey.referencesColumns,
                members: [],
            };

            group.members.push({
                table: sourceTable,
                localKey: foreignKey.columns[0],
                foreignKey: foreignKey.referencesColumns[0],
            });

            groups.set(groupKey, group);
        }
    }

    for (const group of groups.values()) {
        const parentTable = group.parentTable;

        for (const member of group.members) {
            relations.get(member.table.name)!.push({
                relationName: relationNameFromTable(parentTable.name),
                tableName: parentTable.name,
                localKey: member.localKey,
                foreignKey: member.foreignKey,
                typeName: rowTypeNameFromTable(parentTable.name),
            });

            relations.get(parentTable.name)!.push({
                relationName: relationNameFromTable(member.table.name),
                tableName: member.table.name,
                localKey: member.foreignKey,
                foreignKey: member.localKey,
                typeName: rowTypeNameFromTable(member.table.name),
            });

            for (const sibling of group.members) {
                if (sibling.table.name === member.table.name) continue;

                relations.get(member.table.name)!.push({
                    relationName: relationNameFromTable(sibling.table.name),
                    tableName: sibling.table.name,
                    localKey: member.localKey,
                    foreignKey: sibling.localKey,
                    typeName: rowTypeNameFromTable(sibling.table.name),
                });
            }
        }
    }

    for (const [tableName, entries] of relations) {
        const seen = new Set<string>();
        relations.set(
            tableName,
            entries.map((entry) => {
                if (seen.has(entry.relationName)) {
                    let suffix = 2;
                    let candidate = `${entry.relationName}${suffix}`;
                    while (seen.has(candidate)) {
                        suffix++;
                        candidate = `${entry.relationName}${suffix}`;
                    }
                    entry.relationName = candidate;
                }

                seen.add(entry.relationName);
                return entry;
            })
        );
    }

    return relations;
};

const zodExpressionForColumn = (table: TableMeta, column: ColumnMeta): string => {
    const rawType = normalizeSqlType(column.type);
    const hasEmailName = /(^|_)email($|_)/i.test(column.name);
    const isNullable = !column.notNull && !column.primaryKey;

    let expression = "z.string()";

    if (rawType.endsWith("[]")) {
        expression = "z.array(z.string())";
    } else if (rawType === "UUID") {
        expression = "z.uuid()";
    } else if (rawType === "BOOLEAN") {
        expression = "z.boolean()";
    } else if (
        rawType === "INT" ||
        rawType === "INTEGER" ||
        rawType === "SMALLINT" ||
        rawType === "BIGINT"
    ) {
        expression = "z.number().int()";
    } else if (rawType.startsWith("TIMESTAMPTZ") || rawType.startsWith("TIMESTAMP")) {
        expression = "z.date()";
    } else if (rawType.startsWith("VARCHAR")) {
        const lengthMatch = rawType.match(/VARCHAR\((\d+)\)/i);
        expression = hasEmailName ? "z.email()" : "z.string()";
        if (lengthMatch) {
            expression += `.max(${Number(lengthMatch[1])})`;
        }
    } else if (rawType === "TEXT") {
        expression = hasEmailName ? "z.email()" : "z.string()";
    }

    const checks = [
        ...column.checks,
        ...table.constraints
            .filter((constraint) => constraint.type === "check")
            .map((constraint) => constraint.expression),
    ];
    for (const check of checks) {
        const minMatch = check.match(
            new RegExp(`char_length\\(\\s*${column.name}\\s*\\)\\s*>=\\s*(\\d+)`, "i")
        );
        if (minMatch) {
            expression += `.min(${Number(minMatch[1])})`;
        }

        const maxMatch = check.match(
            new RegExp(`char_length\\(\\s*${column.name}\\s*\\)\\s*<=\\s*(\\d+)`, "i")
        );
        if (maxMatch) {
            expression += `.max(${Number(maxMatch[1])})`;
        }
    }

    if (isNullable) {
        expression += ".nullable()";
    }

    return expression;
};

const buildRefinements = (table: TableMeta): string[] => {
    const refinements: string[] = [];
    const checks = table.constraints.filter((constraint) => constraint.type === "check");
    const columnNames = table.columns.map((col) => col.name);

    for (const check of checks) {
        const expression = check.expression.replace(/\s+/g, " ").trim().toLowerCase();

        // Find all column names mentioned in this check (order matters for mapping)
        const mentionedFields = columnNames
            .filter((col) => expression.includes(col.toLowerCase()))
            .sort();

        if (mentionedFields.length === 2) {
            const [field1, field2] = mentionedFields;
            const field1Lower = field1.toLowerCase();
            const field2Lower = field2.toLowerCase();

            // Pattern 1: conditional-notnull (if field1 is true, field2 must be non-null)
            // e.g., (mfa_enabled = false) OR (mfa_secret is not null)
            // e.g., (is_locked = false and lock_expires_at is null) or (is_locked = true and lock_expires_at is not null)
            if (
                (expression.includes(`${field1Lower} = false`) ||
                    expression.includes(`${field1Lower} = true`)) &&
                expression.includes(`${field2Lower} is not null`)
            ) {
                refinements.push(
                    `    (data) => {
        if (data.${field1} && !data.${field2}) return false;
        return true;
    },
    {
        message: "${field2} is required when ${field1} is true",
        path: ["${field2}"],
    }`
                );
                continue;
            }

            // Pattern 2: paired-nullability (both null or both not null)
            // e.g., (reset_token is null and reset_expires_at is null) or (reset_token is not null and reset_expires_at is not null)
            if (
                expression.includes(`${field1Lower} is null`) &&
                expression.includes(`${field2Lower} is null`) &&
                expression.includes(`${field1Lower} is not null`) &&
                expression.includes(`${field2Lower} is not null`)
            ) {
                refinements.push(
                    `    (data) => {
        const hasField1 = !!data.${field1};
        const hasField2 = !!data.${field2};
        return hasField1 === hasField2;
    },
    {
        message: "${field1} and ${field2} must both be present or both be null",
        path: ["${field1}"],
    }`
                );
                continue;
            }
        }
    }

    return refinements;
};

const buildTableSchema = (table: TableMeta): string => {
    const typeName = rowTypeNameFromTable(table.name);
    const fields = table.columns
        .map((column) => `    ${column.name}: ${zodExpressionForColumn(table, column)},`)
        .join("\n");
    const refinements = buildRefinements(table);

    const baseSchemaName = `Base${typeName}Schema`;
    const schemaName = `${typeName}Schema`;
    const omitKeys = [
        "id",
        ...table.columns.filter((column) => column.primaryKey).map((column) => column.name),
        "created_at",
        "updated_at",
    ];
    const uniqueOmitKeys = [...new Set(omitKeys.filter((key) => getColumn(table, key)))];

    return [
        `export const ${baseSchemaName} = z.object({`,
        fields,
        `});`,
        refinements.length
            ? `export const ${schemaName} = ${baseSchemaName}${refinements
                  .map((entry) => `.refine(\n${entry}\n)`)
                  .join("")};`
            : `export const ${schemaName} = ${baseSchemaName};`,
        `export type ${typeName} = z.infer<typeof ${schemaName}>;`,
        `export const Upsert${typeName}Schema = ${baseSchemaName}.omit({ ${uniqueOmitKeys.map((key) => `${key}: true`).join(", ")} });`,
        `export type Upsert${typeName} = z.infer<typeof Upsert${typeName}Schema>;`,
    ].join("\n");
};

const buildUniqueTypeLine = (table: TableMeta): string => {
    const typeName = rowTypeNameFromTable(table.name);
    const uniqueFields = uniqueFieldsForTable(table);
    const compositeUniqueFields = compositeUniqueFieldsForTable(table);
    const simpleUniqueType =
        uniqueFields.length > 0
            ? uniqueFields.map((field) => `"${field}"`).join(" | ")
            : compositeUniqueFields.length > 0
              ? "never"
              : `"id"`;

    const lines = [`export type ${typeName}UniqueFields = ${simpleUniqueType};`];

    if (compositeUniqueFields.length > 0) {
        const tuples = compositeUniqueFields.map(
            (fields) => `[${fields.map((field) => `"${field}"`).join(", ")}]`
        );
        lines.push(`export type ${typeName}CompositeUniqueFields = ${tuples.join(" | ")};`);
    }

    return lines.join("\n");
};

const buildFieldConstants = (table: TableMeta): string => {
    const typeName = tableConstantNameFromTable(table.name);
    const entries = table.columns
        .map((column) => `    ${column.name}: ${quote(column.name)},`)
        .join("\n");

    return [
        `export const ${typeName}TableName = ${quote(table.name)};`,
        `export const ${typeName} = {`,
        entries,
        `} as const;`,
    ].join("\n");
};

const buildGetTableFields = (tables: TableMeta[]): string => {
    const cases = tables
        .map(
            (table) =>
                `        case ${tableConstantNameFromTable(table.name)}TableName:\n            return ${tableConstantNameFromTable(table.name)};`
        )
        .join("\n");

    return `export const getTableFields = (tableName: string) => {\n    switch (tableName) {\n${cases}\n        default:\n            throw new Error(\`Unknown table name: ${"${tableName}"}\`);\n    }\n};`;
};

const generateDbTypes = (tables: TableMeta[]): string => {
    const header = `import z from "zod";\n\n// This file is generated from schema.sql.\n// Run \`npm run generate:orm\` after updating the schema.\n`;

    const sections = tables
        .map((table) => {
            const typeName = rowTypeNameFromTable(table.name);
            return [
                `// -------------- ${typeName} and related types --------------`,
                buildFieldConstants(table),
                buildTableSchema(table),
                buildUniqueTypeLine(table),
            ].join("\n\n");
        })
        .join("\n\n");

    return [
        header,
        sections,
        `\n// -------------- Other functions --------------`,
        buildGetTableFields(tables),
        `\n// -------------- End of types --------------`,
    ].join("\n");
};

const generateClient = (tables: TableMeta[]): string => {
    const relations = buildRelations(tables);
    const importNames = tables.flatMap((table) => {
        const typeName = rowTypeNameFromTable(table.name);
        const tableConstantName = tableConstantNameFromTable(table.name);
        const names = [typeName, `${tableConstantName}TableName`, `${typeName}UniqueFields`];
        if (compositeUniqueFieldsForTable(table).length > 0) {
            names.push(`${typeName}CompositeUniqueFields`);
        }
        return names;
    });

    const importLine = `import {\n    ${importNames.join(",\n    ")},\n} from "./db-types";`;

    const dbEntries = tables
        .map((table) => {
            const typeName = rowTypeNameFromTable(table.name);
            const tableConstantName = tableConstantNameFromTable(table.name);
            const relationEntries = relations.get(table.name) || [];
            const relationType = relationEntries.length
                ? `,\n        { ${relationEntries.map((relation) => `${relation.relationName}: ${relation.typeName}`).join("; ")} }`
                : `,\n        {}`;
            const composite = compositeUniqueFieldsForTable(table);
            const compositeArg = composite.length ? `,\n        ${JSON.stringify(composite)}` : "";

            const relationBlock = relationEntries
                .map(
                    (relation) =>
                        `        ${relation.relationName}: {\n            table: ${tableConstantNameFromTable(relation.tableName)}TableName,\n            localKey: ${quote(relation.localKey)},\n            foreignKey: ${quote(relation.foreignKey)},\n        },`
                )
                .join("\n");

            return [
                `    ${camelCase(table.name)}: new BaseRepository<`,
                `        ${typeName},`,
                `        ${typeName}UniqueFields${relationType}${composite.length ? `,\n        ${typeName}CompositeUniqueFields` : ""}\n    >(${tableConstantName}TableName, {`,
                relationBlock,
                `    }${compositeArg}),`,
            ].join("\n");
        })
        .join("\n");

    return [
        `// This file is generated from schema.sql.`,
        `// Run \`npm run generate:orm\` after updating the schema.`,
        ``,
        `import { BaseRepository } from "./base-repository";`,
        importLine,
        ``,
        `export const db = {`,
        dbEntries,
        `};`,
    ].join("\n");
};

const writeIfChanged = (filePath: string, content: string): void => {
    const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
    if (existing === content) return;
    fs.writeFileSync(filePath, content);
};

const main = (): void => {
    const schema = readSchema();
    const tables = parseTables(schema);

    if (tables.length === 0) {
        throw new Error(`No CREATE TABLE statements found in ${INPUT_SCHEMA_PATH}`);
    }

    writeIfChanged(DB_TYPES_PATH, generateDbTypes(tables));
    writeIfChanged(CLIENT_PATH, generateClient(tables));
};

main();
