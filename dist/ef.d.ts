/// <reference path="../typings/tsd.d.ts" />
export interface DBEntity<T, T_CTX> {
    put(entity: T): Promise<number>;
    put(entities: T[]): Promise<number[]>;
    get(id: number): Promise<T>;
    get(id?: number[]): Promise<T[]>;
    delete(id: number): Promise<T>;
    delete(id?: number[]): Promise<T[]>;
    query(fn: (context: T_CTX, query: DBQuery<T>) => any): Promise<T[]>;
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
export declare class DBSchema {
    static create(dbName: string, dbVersion: number, schema: Object): any;
    static create(jsonFilePath: string): any;
}
export declare class DBContext<T_CTX> {
    private context;
    ready: Promise<any>;
    private loading;
    private loaded;
    constructor(dbName: string, dbStoreType?: lf.schema.DataStoreType);
    purge(): Promise<any>;
    transaction(fn: (tx: lf.Transaction, context: T_CTX) => Promise<any>): Promise<any>;
    tables: T_CTX;
    select(...columns: lf.schema.Column[]): lf.query.Select;
    DBEntity<T, T_CTX>(tableName: string, navigationProperties?: string[]): DBEntity<T, T_CTX>;
}
export declare class is {
    static array(x: any): boolean;
    static number(x: any): boolean;
    static string(x: any): boolean;
    static object(x: any): boolean;
    static undefined(x: any): boolean;
}
export declare class StringUtils {
    static removeWhiteSpace(str: string): string;
}
export declare class PromiseUtils {
    static serial(...items: any[][]): Promise<{}>;
}
export declare class Load {
    private static cache;
    static json(url: string, async?: boolean, cache?: boolean): any;
}
