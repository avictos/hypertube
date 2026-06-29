/**
 * Comparison operators for filtering data.
 * | Operator | Description | Logic |
 * | :--- | :--- | :--- |
 * | `eq` | **Equal** | `column = value` |
 * | `ne` | **Not Equal** | `column != value` |
 * | `lt` | **Less Than** | `column < value` |
 * | `lte` | **Less Than or Equal** | `column <= value` |
 * | `gt` | **Greater Than** | `column > value` |
 * | `gte` | **Greater Than or Equal** | `column >= value` |
 * | `in` | **In Array** | `column IN (...values)` |
 * | `like` | **Pattern Match** | `column LIKE 'pattern'` |
 * | `overlap` | **Array Overlap** | `column && ARRAY[...values]` |
 */
export type QueryOperator<T> = {
    eq?: T;
    ne?: T;
    lt?: T;
    lte?: T;
    gt?: T;
    gte?: T;
    in?: T[];
    like?: string;
    overlap?: T[];
};

export type WhereClause<T> = {
    [K in keyof T]?: T[K] | QueryOperator<T[K]>;
};

/**
 * Transforms a list of keys into a union of objects.
 * Follows Unionized Mapped Type pattern
 * Result for User: { id: string } | { username: string }
 */
export type UniqueWhere<T, K extends keyof T, C extends readonly (keyof T)[] = never> =
    | {
          [P in K]: { [Q in P]: T[Q] };
      }[K]
    | (C extends readonly (keyof T)[]
          ? {
                [P in C[number]]: T[P];
            }
          : never);
