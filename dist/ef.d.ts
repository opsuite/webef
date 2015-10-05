/// <reference path="../typings/tsd.d.ts" />

declare module WebEF {
    export interface DBEntity<T, E_CTX, T_CTX> {
        put(entity: T): Promise<number>;
        put(entities: T[]): Promise<number[]>;
        get(id: number): Promise<T>;
        get(id?: number[]): Promise<T[]>;
        delete(id: number): Promise<T>;
        delete(id?: number[]): Promise<T[]>;
        query(fn: (context: E_CTX, query: DBQuery<T>) => any): Promise<T[]>;
        count(fn: (context: E_CTX, query: DBCount<T>) => any): Promise<number>;
        select(fn: (context: T_CTX, query: DBQuery<T>) => any): Promise<T[]>;
    }
    export interface DBQuery<T> {
        groupBy(...columns: lf.schema.Column[]): DBQuery<T>;
        limit(numberOfRows: lf.Binder | number): DBQuery<T>;
        orderBy(column: lf.schema.Column, order?: lf.Order): DBQuery<T>;
        skip(numberOfRows: lf.Binder | number): DBQuery<T>;
        where(predicate: lf.Predicate): DBQuery<T>;
        explain(): string;
        toSql(): string;
        exec(): Promise<T[]>;
    }
    interface DBCount<T> {
        where(predicate: lf.Predicate): DBCount<T>;
        explain(): string;
        toSql(): string;
        exec(): number;
    }
    
    export class DBSchema {
        static create(dbName: string, dbVersion: number, schema: Object): void;
        static create(jsonFilePath: string): void;
    }
    export class DBContext<E_CTX> {
        ready: Promise<any>;
        constructor(dbName: string, dbStoreType?: lf.schema.DataStoreType, dbSizeMB?: number);
        purge(): Promise<any>;
        transaction(fn: (tx: lf.Transaction, context: E_CTX) => Promise<any>): Promise<any>;
        tables: E_CTX;
        select(...columns: lf.schema.Column[]): lf.query.Select;
        getCheckpoint(): number;
        DBEntity<T, E_CTX, T_CTX>(tableName: string, navigationProperties?: string[]): DBEntity<T, E_CTX, T_CTX>;
    }
}
declare module 'WebEF' {
    export = 'WebEF';
}
