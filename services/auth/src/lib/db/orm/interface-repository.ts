/* eslint-disable @typescript-eslint/no-explicit-any */
import { getPool } from "./pool";

import { WhereClause } from "./operations/types";

export class InterfaceRepository<T> {
    constructor(public tableName: string) {}

    // Follows Singleton Design pattern of getPool() method.
    protected async query(sql: string, params?: readonly unknown[]) {
        const pool = getPool();
        return pool.query(sql, params as any[]);
    }

    protected processFilters(where: WhereClause<T>, startingParamIndex = 1) {
        const clauses: string[] = [];
        const values: any[] = [];
        let paramIndex = startingParamIndex;

        const operatorMap: Record<string, string> = {
            eq: "=",
            ne: "!=",
            lt: "<",
            lte: "<=",
            gt: ">",
            gte: ">=",
            in: "IN",
            like: "LIKE",
            overlap: "&&",
        };

        for (const [column, value] of Object.entries(where)) {
            // If value doesn't exist, then there is no point of adding the clause to sql statement
            if (value === null || value === undefined) continue;

            if (typeof value === "object" && !Array.isArray(value)) {
                for (const [op, val] of Object.entries(value)) {
                    const sqlOp = operatorMap[op];
                    if (!sqlOp) continue;

                    if (sqlOp === "IN") {
                        const inValues = Array.isArray(val) ? val : [val];

                        if (inValues.length === 0) {
                            // Empty IN should not produce invalid SQL (IN ()) and should match no rows.
                            clauses.push("FALSE");
                            continue;
                        }

                        const placeholders = inValues.map(() => `$${paramIndex++}`).join(", ");
                        clauses.push(`${column} ${sqlOp} (${placeholders})`);
                        values.push(...inValues);
                    } else {
                        clauses.push(`${column} ${sqlOp} $${paramIndex++}`);
                        values.push(val);
                    }
                }
            } else {
                // If the value isn't an object or an array then it is just a simple value
                clauses.push(`${column} = $${paramIndex++}`);
                values.push(value);
            }
        }

        return { clauses: clauses.join(" AND "), values };
    }
}
