/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseMutationOperationsRepository } from "./operations/mutation";
import { BaseRetrievalOperationsRepository } from "./operations/retreivale";
import { BasePersistenceOperationsRepository } from "./operations/persistence";

export type RelationConfig<T = any> = {
    table: string;
    localKey: keyof T;
    foreignKey: string;
};

export type RelationsMap<T = any> = Record<string, RelationConfig<T>>;

// Instance Composition Design pattern for better separation of concerns and testability
export class BaseRepository<
    T,
    U extends keyof T,
    R extends Record<string, any> = {},
    C extends readonly (keyof T)[] = never,
> {
    private retrievalRepo: BaseRetrievalOperationsRepository<T, U, R, C>;
    private persistRepo: BasePersistenceOperationsRepository<T>;
    private mutationRepo: BaseMutationOperationsRepository<T>;

    constructor(
        tableName: string,
        relations: RelationsMap = {},
        compositeUniqueKeys: ReadonlyArray<C> = []
    ) {
        this.retrievalRepo = new BaseRetrievalOperationsRepository<T, U, R, C>(
            tableName,
            relations,
            compositeUniqueKeys
        );
        this.persistRepo = new BasePersistenceOperationsRepository<T>(tableName);
        this.mutationRepo = new BaseMutationOperationsRepository<T>(tableName);
    }

    /**
     * Finds a single record by unique criteria.
     * Accepts a single unique key or a declared composite-unique key set and returns null when no row matches.
     */
    public findUnique(
        ...args: Parameters<BaseRetrievalOperationsRepository<T, U, R, C>["findUnique"]>
    ): ReturnType<BaseRetrievalOperationsRepository<T, U, R, C>["findUnique"]> {
        return this.retrievalRepo.findUnique(...args);
    }

    /**
     * Finds the first record matching the filter and optional sort/offset.
     * Useful for non-unique lookups where only one row is needed.
     */
    public findFirst(
        ...args: Parameters<BaseRetrievalOperationsRepository<T, U, R, C>["findFirst"]>
    ): ReturnType<BaseRetrievalOperationsRepository<T, U, R, C>["findFirst"]> {
        return this.retrievalRepo.findFirst(...args);
    }

    /**
     * Finds multiple records matching the filter with optional sort, limit, and offset.
     * Returns an array of rows (empty when no matches).
     */
    public findMany(
        ...args: Parameters<BaseRetrievalOperationsRepository<T, U, R, C>["findMany"]>
    ): ReturnType<BaseRetrievalOperationsRepository<T, U, R, C>["findMany"]> {
        return this.retrievalRepo.findMany(...args);
    }

    /**
     * Counts records matching the filter and returns the numeric count.
     */
    public count(
        ...args: Parameters<BaseRetrievalOperationsRepository<T, U, R, C>["count"]>
    ): ReturnType<BaseRetrievalOperationsRepository<T, U, R, C>["count"]> {
        return this.retrievalRepo.count(...args);
    }

    /**
     * Creates a single record and returns the full row or selected fields when a select list is provided.
     */
    public create(
        ...args: Parameters<BasePersistenceOperationsRepository<T>["create"]>
    ): ReturnType<BasePersistenceOperationsRepository<T>["create"]> {
        return this.persistRepo.create(...args);
    }

    /**
     * Creates multiple records in one statement and returns created rows or selected fields.
     */
    public createMany(
        ...args: Parameters<BasePersistenceOperationsRepository<T>["createMany"]>
    ): ReturnType<BasePersistenceOperationsRepository<T>["createMany"]> {
        return this.persistRepo.createMany(...args);
    }

    /**
     * Updates records matching the filter and returns the updated rows.
     */
    public update(
        ...args: Parameters<BaseMutationOperationsRepository<T>["update"]>
    ): ReturnType<BaseMutationOperationsRepository<T>["update"]> {
        return this.mutationRepo.update(...args);
    }

    /**
     * Deletes records matching the filter and returns the deleted rows.
     */
    public delete(
        ...args: Parameters<BaseMutationOperationsRepository<T>["delete"]>
    ): ReturnType<BaseMutationOperationsRepository<T>["delete"]> {
        return this.mutationRepo.delete(...args);
    }
}
