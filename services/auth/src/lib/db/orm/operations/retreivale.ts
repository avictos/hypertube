import { UniqueWhere, WhereClause } from "./types";

import { InterfaceRepository } from "../interface-repository";
import { DB_Error } from "./db-error";
import { DatabaseError } from "pg";
import { RelationsMap } from "../base-repository";
import { getTableFields } from "../db-types";

interface FindOptions<T> {
    where?: WhereClause<T>;
    orderBy?: { [K in keyof T]?: "ASC" | "DESC" };
    limit?: number;
    offset?: number;
    select?: (keyof T)[];
}

type IncludeOptions<R> = {
    [K in keyof R]?:
        | boolean
        | {
              select?: (keyof R[K])[];
              orderBy?: { [K2 in keyof R[K]]?: "ASC" | "DESC" };
          };
};

type RelationIncludeResult<Relation, IncludeOption> = IncludeOption extends {
    select: (infer SelectedFields)[];
}
    ? Pick<Relation, Extract<SelectedFields, keyof Relation>>
    : Relation;

export type WithIncludes<T, R, I extends IncludeOptions<R>> = Partial<T> & {
    [K in keyof I & keyof R]: RelationIncludeResult<R[K], NonNullable<I[K]>>;
};

export class BaseRetrievalOperationsRepository<
    T,
    U extends keyof T,
    R extends Record<string, any> = {},
    C extends readonly (keyof T)[] = never,
> extends InterfaceRepository<T> {
    constructor(
        tableName: string,
        public relations: RelationsMap<T> = {},
        private compositeUniqueKeys: ReadonlyArray<C> = []
    ) {
        super(tableName);
    }

    private mapResult = (row: any): any => {
        if (!row) return null as any;

        const result: any = {};
        // map the returned row to the expected output format,
        // handling included relations with __ separator for nested fields
        for (const [key, value] of Object.entries(row)) {
            // If the key includes __, it indicates a nested field from a joined table
            if (key.includes("__")) {
                const [relName, fieldName] = key.split("__");

                // Initialize the relation object if it doesn't exist
                if (value === null && !result[relName]) {
                    result[relName] = null;
                    continue;
                }
                if (!result[relName]) result[relName] = {};

                // Assign the value to the appropriate field in the relation object
                result[relName][fieldName] = value;
            } else {
                // Regular field, assign directly to the result
                result[key] = value;
            }
        }
        return result;
    };

    /**
     * Finds a single record that matches the provided unique criteria. Supports selecting specific fields and including related records based on defined relations.
     * @param options.where An object specifying the unique field and its value to filter the record. Must contain exactly one unique key-value pair.
     * @param options.select An optional array of field names to select from the main table. If not provided, all fields will be selected.
     * @param include An optional object specifying related records to include based on defined relations. Each key corresponds to a relation name, and the value can be a boolean (true to include all fields) or an object with a select property to specify which fields to include from the related table.
     * @returns
     */
    async findUnique<I extends IncludeOptions<R>>({
        where,
        select,
        include,
    }: {
        where: UniqueWhere<T, U, C>; // Enforces only UNIQUE fields
        select?: (keyof T)[];
        include?: I;
    }): Promise<WithIncludes<T, R, I> | null> {
        // 1. Cast for safe access and extract the key/value
        const whereRecord = where as Record<string, any>;
        const keys = Object.keys(whereRecord) as (keyof T)[];

        if (keys.length === 0) {
            throw new Error("findUnique requires at least one unique key-value pair.");
        }

        const compositeKeySet = this.compositeUniqueKeys.find(
            (keySet) => keySet.length === keys.length && keySet.every((key) => keys.includes(key))
        );

        if (keys.length > 1 && !compositeKeySet) {
            throw new Error(
                "findUnique requires exactly one unique key or a valid composite unique key set."
            );
        }

        const orderedKeys = compositeKeySet ? [...compositeKeySet] : keys;
        const values = orderedKeys.map((key) => whereRecord[String(key)]);

        // 1. Build Select Clause
        let selectClause = select
            ? select.map((field) => `${this.tableName}.${String(field)}`).join(", ")
            : `${this.tableName}.*`;

        let joinClause = "";
        const orderByClauses: string[] = [];

        if (include) {
            for (const [relName, relOptions] of Object.entries(include)) {
                if (typeof relOptions === "boolean" && relOptions === false) continue;

                const relConfig = this.relations[relName];
                if (!relConfig) continue;

                // Add LEFT JOIN
                joinClause += ` LEFT JOIN ${relConfig.table} ON ${this.tableName}.${String(relConfig.localKey)} = ${relConfig.table}.${relConfig.foreignKey}`;

                const hasManualSelect =
                    typeof relOptions === "object" &&
                    Array.isArray(relOptions.select) &&
                    relOptions.select.length > 0;

                if (hasManualSelect) {
                    const nestedColumns = relOptions
                        .select!.map(
                            (field) =>
                                `${relConfig.table}.${String(field)} AS "${relName}__${String(field)}"`
                        )
                        .join(", ");
                    selectClause += `, ${nestedColumns}`;
                } else {
                    const relTableFields = getTableFields(relConfig.table);
                    for (const field in relTableFields) {
                        selectClause += `, ${relConfig.table}.${String(field)} AS ${relName}__${String(field)}`;
                    }
                }

                // Collect orderBy for this relation
                if (typeof relOptions === "object" && relOptions.orderBy) {
                    for (const [column, direction] of Object.entries(relOptions.orderBy)) {
                        const dir = direction === "DESC" ? "DESC" : "ASC";
                        orderByClauses.push(`${relConfig.table}.${String(column)} ${dir}`);
                    }
                }
            }
        }

        // 2. Build the parameterized SQL query
        //! we use parameterized queries to prevent SQL injection attacks
        const whereClause = orderedKeys
            .map((key, index) => `${this.tableName}.${String(key)} = $${index + 1}`)
            .join(" AND ");
        const orderByClause = orderByClauses.length ? ` ORDER BY ${orderByClauses.join(", ")}` : "";
        const sql = `SELECT ${selectClause} FROM ${this.tableName}${joinClause} WHERE ${whereClause}${orderByClause} LIMIT 2;`;

        try {
            // 3. Execute the query and return the result
            const result = await this.query(sql, values);

            if (result.rowCount && result.rowCount === 0) {
                return null; // No record found
            }

            if (result.rowCount && result.rowCount > 1) {
                throw new Error(
                    `Integrity Error: Unique constraint violation in findUnique. Found ${result.rowCount} records.`
                );
            }

            return this.mapResult(result.rows[0]);
        } catch (error) {
            if (error instanceof DatabaseError) {
                throw new DB_Error(error);
            }
            throw error;
        }
    }

    /**
     * Finds the first record that matches the provided criteria. Supports advanced filtering, sorting, and pagination options.
     * @param param0 An object containing the options for the query, including select fields, where clause, order by, and offset
     * @returns A promise that resolves to the found record or null if no record is found. Throws an error if a database error occurs during the query.
     * @throws {DB_Error} If a database error occurs during the query, a DB_Error is thrown with details about the error.
     */
    async findFirst({ where, orderBy, offset, select }: Omit<FindOptions<T>, "limit">) {
        const values: any[] = [];

        const columns = select ? select.join(", ") : "*";
        let sql = `SELECT ${columns} FROM ${this.tableName}`;

        if (where) {
            const { clauses, values: whereValues } = this.processFilters(where);
            sql += ` WHERE ${clauses}`;
            values.push(...whereValues);
        }

        if (orderBy) {
            const orderClauses = Object.entries(orderBy).map(
                ([column, direction]) => `${column} ${direction}`
            );
            sql += ` ORDER BY ${orderClauses.join(", ")}`;
        }

        if (offset !== undefined) {
            sql += ` OFFSET ${offset}`;
        }

        sql += ` LIMIT 1`; // Ensure only one record is returned

        try {
            const result = await this.query(sql, values);
            return (result.rows[0] as T) || null;
        } catch (error) {
            if (error instanceof DatabaseError) {
                throw new DB_Error(error);
            }
            throw error;
        }
    }

    /**
     * Finds multiple records that match the provided criteria. Supports advanced filtering, sorting, and pagination options.
     * @param param0 An object containing the options for the query, including select fields, where clause, order by, limit, and offset
     * @returns A promise that resolves to an array of found records. Throws an error if a database error occurs during the query.
     * @throws {DB_Error} If a database error occurs during the query, a DB_Error is thrown with details about the error.
     */
    async findMany({ where, orderBy, limit, offset, select }: FindOptions<T>) {
        const values: any[] = [];

        // 1. SELECT Column logic
        const columns = select ? select.join(", ") : "*";
        let sql = `SELECT ${columns} FROM ${this.tableName}`;

        // 2. Advanced WHERE logic
        if (where) {
            const { clauses, values: whereValues } = this.processFilters(where);
            sql += ` WHERE ${clauses}`;
            values.push(...whereValues);
        }

        // 3. ORDER BY logic
        if (orderBy) {
            const orderClauses = Object.entries(orderBy).map(
                ([column, direction]) => `${column} ${direction}`
            );
            sql += ` ORDER BY ${orderClauses.join(", ")}`;
        }

        // 4. LIMIT and OFFSET logic
        if (limit !== undefined) {
            sql += ` LIMIT ${limit}`;
        }
        if (offset !== undefined) {
            sql += ` OFFSET ${offset}`;
        }

        try {
            const result = await this.query(sql, values);
            return (result.rows as T[]) || null;
        } catch (error) {
            if (error instanceof DatabaseError) {
                throw new DB_Error(error);
            }
            throw error;
        }
    }

    /**
     * Counts the number of records that match the provided criteria. Supports advanced filtering options.
     * @param param0 An object containing the options for the query, including the where clause for filtering
     * @returns A promise that resolves to the count of matching records. Throws an error if a database error occurs during the query.
     * @throws {DB_Error} If a database error occurs during the query, a DB_Error is thrown with details about the error.
     */
    async count({ options }: { options?: { where?: WhereClause<T> } }): Promise<number> {
        const { clauses, values } = this.processFilters(options?.where || {});

        let sql = `SELECT COUNT(*) FROM ${this.tableName}`;

        sql += clauses ? ` WHERE ${clauses}` : "";

        try {
            const result = await this.query(sql, values);

            const row = result.rows[0] as unknown as { count: string | number } | undefined;

            return Number(row?.count ?? 0);
        } catch (error) {
            if (error instanceof DatabaseError) {
                throw new DB_Error(error);
            }
            throw error;
        }
    }

    // async aggregate(criteria: Partial<T>) {}

    // async groupBy(criteria: Partial<T>) {}
}
