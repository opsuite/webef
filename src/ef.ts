/*-----------------------------------------------------------------------------
| Copyright (c) 2015, Positive Technology
| Distributed under the terms of the MIT License.
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/

/// <reference path="../typings/tsd.d.ts" />
import 'lovefield';

export module WebEF {    
    // exports
    export interface DBEntity<T, E_CTX, T_CTX> {
        put(entity: T): Promise<number>;
        put(entities: T[]): Promise<number[]>;
        get(id: number): Promise<T>;
        get(id?: number[]): Promise<T[]>;
        delete(id: number): Promise<T>;
        delete(id?: number[]): Promise<T[]>;
        query( fn: (context:E_CTX, query:DBQuery<T>)=>any): Promise<T[]>;
        count( fn: (context:E_CTX, query:DBCount<T>)=>any): Promise<number>;
        select( fn: (context:T_CTX, query:DBQuery<T>)=>any): Promise<T[]>;
    }
    export interface DBQuery<T> {
        groupBy(...columns: lf.schema.Column[]): DBQuery<T>
        limit(numberOfRows: lf.Binder|number): DBQuery<T>
        orderBy(column: lf.schema.Column, order?: lf.Order): DBQuery<T>
        skip(numberOfRows: lf.Binder|number): DBQuery<T>
        where(predicate: lf.Predicate): DBQuery<T>
        explain():string
        toSql():string
        exec() : Promise<T[]>
    }
    export interface DBCount<T> {
        where(predicate: lf.Predicate): DBCount<T>
        explain():string
        toSql():string
        exec():number;
    }
    
    interface DBModel {}
    
    export class DBSchema {
        public static create (dbName: string, dbVersion: number, schema: Object): void;
        public static create (jsonFilePath:string): void;     
        public static create (...args: any[]): void {       
            var dbName:string, 
                dbVersion:number, 
                schema: Object;
                
            if (args.length === 3){
                dbName = args[0];
                dbVersion = args[1];
                schema = args[2]
            }
            else if (args.length === 1) {
                var data = Load.json(args[0]);
                dbName = data.name;
                dbVersion = data.version;
                schema = data.schema;
            }
                    
            var schemaBuilder = lf.schema.create(dbName, dbVersion);        
            var columns:any = {};
            var nav:any = {};
            var fk:any = {};
            var pk:any = {};
            var tables:string[] = [];
            var options:any = {};
            
            for (var table in schema){
                var tableSchema = schema[table];
                var tb =schemaBuilder.createTable(table);
                
                tables.push(table);            
                var nullables = [];
                var indeces = [];
                columns[table] = [];
                nav[table] = {};
                fk[table] = {}           
                options[table] = {};
                
                var pkeys : string[] = [];
                for (var column in tableSchema){
                    var typeDef = StringUtils.removeWhiteSpace(tableSchema[column]);
                    var isColumn = true;
                    var isPkey = false;
                    
                    if (typeDef.indexOf('pkey')===0){
                        tb.addColumn(column, lf.Type.INTEGER)
                        isPkey=true;
                        pkeys.push(column)
                        pk[table] = column;
                    }
                    else if (typeDef.indexOf('string') === 0){
                        tb.addColumn(column, lf.Type.STRING)
                    }
                    else if (typeDef.indexOf('date')===0){
                        tb.addColumn(column, lf.Type.DATE_TIME)
                    }
                    else if (typeDef.indexOf('boolean')===0){
                        tb.addColumn(column, lf.Type.BOOLEAN)
                    }
                    else if (typeDef.indexOf('int')===0){
                        tb.addColumn(column, lf.Type.INTEGER)
                    }
                    else if (typeDef.indexOf('float')===0){
                        tb.addColumn(column, lf.Type.NUMBER)
                    }
                    else if (typeDef.indexOf('object')===0){
                        tb.addColumn(column, lf.Type.OBJECT)
                    }
                    else if (typeDef.indexOf('array')===0){
                        tb.addColumn(column, lf.Type.ARRAY_BUFFER)
                    }                
                    else if (typeDef.indexOf('fkey')===0){
                        tb.addColumn(column, lf.Type.INTEGER)    
                        nullables.push(column);      
                        
                        var x =typeDef.split(':')[1].split('.');
                        fk[table][column] = {
                            columnName: column,
                            fkTable: x[0],
                            fkColumn: x[1]
                        }
                        
                        /* fkeys currently disabled 
                            because a bug in entity.put() executes queries
                            in paralell instead of in series.
                        */
                        /*
                        tb.addForeignKey(`fk_${column}`, {
                            local: column,
                            ref: `${x[0]}.${x[1]}`,
                            action: lf.ConstraintAction.RESTRICT,
                            timing: lf.ConstraintTiming.DEFERRABLE
                        });
                        */
                        
                    }
                    else if (typeDef.indexOf('nav->')==0){
                        isColumn = false;  
                        var x=typeDef.split('>')[1].split(':');
                        var y=x[1].split('.');
                        
                        var tableName=x[0];
                        var fkTable=y[0];
                        var fkColumn=y[1];
                        
                        nav[table][column] = {
                        columnName: column,
                        tableName: tableName,
                        fkTable: fkTable,
                        fkColumn: fkColumn,
                        isArray: (fkTable === tableName)
                        };
                    }
                    else if (typeDef.indexOf('dbtimestamp')===0){
                        tb.addColumn(column, lf.Type.INTEGER)
                        options[table]['dbtimestamp'] = column;
                    }
                    else if (typeDef.indexOf('isdeleted')===0){
                        tb.addColumn(column, lf.Type.BOOLEAN);
                        options[table]['isdeleted'] = column;
                    }
                    if (isColumn) {
                        
                        // add indeces and unique constraints if requested
                        var ops = typeDef.split(',')
                        if (ops.indexOf('index') !== -1){     
                            var unique = (ops.indexOf('unique') !== -1);                   
                            indeces.push(column);
                        }
                        if (ops.indexOf('null') !== -1)
                            nullables.push(column);
                        columns[table].push(column);
                    }
                    
                }
                if (pkeys.length ===0) throw `Schema Error: no primary key was specified for table '${table}'`;
                if (pkeys.length > 1) throw `Schema Error: more than one primary key was specified for table '${table}'`;
                tb.addPrimaryKey(pkeys); 
                tb.addNullable(nullables);
                tb.addIndex(`ix_${table}`, indeces); 
            }      
            
            DBSchemaInternal.instanceMap[dbName] = 
                new DBInstance(dbName, dbVersion, schemaBuilder, columns, nav, tables, fk, options, pk);
            
        }
        
    }
    class DBSchemaInternal  {
        public static instanceMap : {} = {}; 
    }
    class DBInstance {
        constructor( 
            public dbName: string,
            public dbVersion: number, 
            public schemaBuilder: lf.schema.Builder,
            public schema: Object,
            public nav: Object,
            public tables: string[],
            public fk: Object,
            public options: Object,
            public pk: Object){}
            
        public newTableMap(){
            var map = {};
            for (var i=0 ; i<this.tables.length; i++){
                map[this.tables[i]]=[];
            }
            return map;
        }
    }
    
    export class DBContext<E_CTX> {
        
        private context :  DBContextInternal;
    
        public ready: Promise<any>;    
        private loading: boolean = false;
        private loaded: boolean = false;
        
        constructor(dbName: string, dbStoreType?: lf.schema.DataStoreType, dbSizeMB?: number) {       
            this.context = new DBContextInternal();
            this.context.dbStoreType = (dbStoreType===undefined) ? lf.schema.DataStoreType.WEB_SQL : dbStoreType; 
            this.context.dbInstance = DBSchemaInternal.instanceMap[dbName];         
            var dbSize = (dbSizeMB || 1) * 1024 * 1024; /* db size 1024*1024 = 1MB */
            
            var self = this;
            this.ready = new Promise((resolve,reject)=>{
                try{
                this.context.dbInstance.schemaBuilder.connect({ 
                    storeType: self.context.dbStoreType,
                    webSqlDbSize: dbSize })
                .then(db => { 
                    this.context.db = db;
                    
                    // get schema for tables
                    this.context.tableSchemaMap = this.context.dbInstance.newTableMap();
                    this.context.tables = [];
                    for (var table in this.context.tableSchemaMap  ){
                        let t= this.context.db.getSchema().table(table);
                        this.context.tableSchemaMap[table] = t;       
                        this.context.tables.push(t);
                    }
                    resolve();                                    
                });           
                }
                catch (e){
                    reject(e);
                }   
            })
                                    
        }
        
        // this will delete all rows from all tables ad purge all key and dbtimestamp indeces 
        public purge() : Promise<any> {
            var tx= this.context.db.createTransaction();
            var q=[];
            for (var tName in this.context.tableSchemaMap){
                var table = this.context.tableSchemaMap[tName];
                q.push(this.context.db.delete().from(table));
                
                this.context.purgeKeys(tName);
            }
            this.context.purgeKeys('dbtimestamp');
            return tx.exec(q);
        }
            
        // open a new transaction with an exclusive lock on the specified tables
        public transaction( fn: (tx: lf.Transaction, context: E_CTX)=>Promise<any>) : Promise<any>{
            this.context.tx= this.context.db.createTransaction();
            // get a lock on all the tables in the DBContext
            return this.context.tx.begin(this.context.tables).then(()=>{
                var p= fn(this.context.tx,<E_CTX>this.context.tableSchemaMap).then(()=>{
                    this.context.tx.commit();
                    this.context.tx= undefined;    
                });        
                return p;       
            });         
        }
        
        public get tables() : E_CTX{
            return <E_CTX>this.context.tableSchemaMap;
        }
        public select(...columns: lf.schema.Column[]) : lf.query.Select {
            return this.context.db.select.apply(this.context.db,columns);
        }
        
        public getCheckpoint() : number {
            if (!localStorage) throw new Error('localstorage not supported!');
            var key = `${this.context.dbInstance.dbName}${this.context.dbStoreType}.dbtimestamp.masterIndex`;
            var s=localStorage.getItem(key);
            if (!s) return 0
            var n = parseInt(s);
            if (isNaN(n)) return 0;
            return n;
        }
        
        
        public DBEntity<T, E_CTX, T_CTX>( tableName:string, navigationProperties?: string[] ){                
            return <DBEntity<T, E_CTX, T_CTX>>(new DBEntityInternal<T, E_CTX, T_CTX>(this.context, tableName, navigationProperties, this.ready));
        }          
    }
    
    // private classes
    class DBContextInternal {
        public dbInstance: DBInstance;
        public dbStoreType: lf.schema.DataStoreType;
        public db: lf.Database;
        public tableSchemaMap: Object;
        public tables: lf.schema.Table[];
        public tx: lf.Transaction;
        
        public compose(table: string, rows: Object[], fkmap: Object) : Object[] {
                    
            var map =fkmap[table];
            // if there are no foreign keys there is nothing more to compose
            if (map === undefined) return rows;
            var key = map.column2;        
                        
            // this is a hack to fix undefined keyvalue where table: nav->table2: table2.fkey                         
            // need to figure out why column2 does not always hold the correct key
            if (rows[0] && undefined === rows[0][table][key]) key = map.column1;
            
            // entities
            const entities: Object[] = [];
            const distinct: Object[][]= [];
            
            const keyvalues = {};
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const keyvalue = row[table][key];
                if (undefined === keyvalues[keyvalue]) {
                    keyvalues[keyvalue] = entities.length; //store the index
                    var first = row[table]; // only save the first element with this keyvalue
                    
                    // clone before making modification to prevent lovefield index cache from
                    // being corrupted
                    var clone = JSON.parse(JSON.stringify(first));
                    entities.push(clone);                                 
                }
                var index = keyvalues[keyvalue];
                if (distinct[index]=== undefined)
                    distinct[index] = [];
                distinct[index].push(row); // store the row in a lookup table
                
            }
            
            for (var keyvalue in keyvalues){
                const index = keyvalues[keyvalue];
                rows = distinct[index];
    
                // position children (recursive)
                for (var z=0; z< rows.length; z++){
                    // clone before making modification to prevent lovefield index cache from
                    // being corrupted
                    var row = JSON.parse(JSON.stringify(rows[z]));                
                    this.compose_(table,row,entities[index]);
                }                                 
            }
            return entities;
        } 
        
        private compose_(table:string, row: Object, parent: Object) {
            var navs = this.dbInstance.nav[table];
            for (var column in navs)
            {
                var nav = navs[column];
                var child = row[nav.tableName];
                
                // bug? in some cases child is undefined
                if (child){
                    if (nav.isArray){
                        if (undefined === parent[nav.columnName])
                            parent[nav.columnName] = [child]
                        else 
                            parent[nav.columnName].push(child);
                    }
                    else {
                        parent[nav.columnName] = child;
                    }
                    this.compose_(nav.tableName, row, child)
                }
                
            }
        }
            
        public decompose( table:string, entities: Object[] ){
            var map = this.dbInstance.newTableMap();
            for (var i=0; i<entities.length; i++){
                var e=entities[i];
                map[table].push(e);
                this.decompose_(table, e, map);
            }
            return map;
        }
        private decompose_( table:string, entity: Object, map: Object ){
            for (var prop in entity){
                var nav = this.dbInstance.nav[table][prop];
                if (nav !== undefined){
                    var value = entity[prop];
                    if (is.array(value)){
                        for (var i=0; i<value.length; i++){
                            map[nav.tableName].push(value[i]);
                            this.decompose_(nav.tableName, value[i], map);    
                        }
                    }
                    else if (is.object(value)){
                        map[nav.tableName].push(value);
                        this.decompose_(nav.tableName, value, map);
                    }                
                }
            }
        }    
    
        public allocateKeys(table:string, take?:number):number {
            var key = `${this.dbInstance.dbName}${this.dbStoreType}.${table}.masterIndex`;
            var lsvalue = window.localStorage.getItem( key );
            var value:number, nextvalue:number;
            if (lsvalue === null) value=1; else value = parseInt(lsvalue);
            nextvalue = value;
            if (!take) take=1;
            nextvalue += take; 
            window.localStorage.setItem(key, nextvalue.toString());
            //console.log(`${table}:${value}`);
            return value;        
        }
        public rollbackKeys(table:string, idIndex:number){
            var key = `${this.dbInstance.dbName}${this.dbStoreType}.${table}.masterIndex`;
            window.localStorage.setItem(key, (idIndex-1).toString());
        }
        public purgeKeys(table:string) {
            var key = `${this.dbInstance.dbName}${this.dbStoreType}.${table}.masterIndex`;
            localStorage.removeItem(key);
        }
        
        public exec(q:any){
            if (this.tx){
                return this.tx.attach(q);
            }
            else {
                return q.exec();
            }
        }   
        
        public execMany(q:any[]){
            if (this.tx){            
                q=q.reverse();
                return this._execMany(q);
            }
            else {
                var tx = this.db.createTransaction();
                return tx.exec(q);
            }
        }
        private _execMany(q:any[]){
            var q1 = q.pop();
            var a = this.tx.attach(q1);
            if (q.length === 0) return a;
            else return a.then(()=>{ return this.execMany(q) });
        }
        
    }
    
    interface QueryJoin {
        table: lf.schema.Table;
        predicateleft: lf.schema.Column;
        predicateright: lf.schema.Column;
    }
    
    class DBEntityInternal<T, E_CTX, T_CTX> implements DBEntity<T, E_CTX, T_CTX> {
    
        private context : DBContextInternal;
        private tableName : string;
        private navigationProperties: string[]=[];
        private navigationTables: string[]=[];
        private tables: string[]=[];
        private nav: Object;
        private fkmap: Object;
        private pk: string;
        
        // used for query()
        private join: QueryJoin[]=[];
        private tblmap: Object={};
        
        constructor(context: DBContextInternal, tableName:string, navigationProperties?: string[], ready?: Promise<any>) {
                    
            this.context = context;
            this.tableName = tableName;        
            this.navigationProperties = navigationProperties || [];
            this.nav = context.dbInstance.nav[tableName];
            this.pk = context.dbInstance.pk[tableName];
            for (var column in this.nav)
                this.navigationTables.push( this.nav[column].tableName);
            for (var i=0; i<this.navigationTables.length; i++)
                this.tables.push(this.navigationTables[i]);
            this.tables.push(this.tableName);
            
            this.fkmap = {};
            for (var i=0; i<this.tables.length; i++){
            
                var tableName = this.tables[i];            
                var fkeys = this.context.dbInstance.fk[tableName];
                
                // determine if there are fkeys to any navigation tables
                for (var column in fkeys){
                    var fk = fkeys[column];
                    if (this.tables.indexOf(fk.fkTable) !== -1){
                        //fkmap[tableName].push(fk);
                        this.fkmap[tableName]={
                            table1: tableName,
                            column1: column,
                            table2: fk.fkTable,
                            column2: fk.fkColumn
                        };
                        this.fkmap[fk.fkTable]={
                            table1: fk.fkTable,
                            column1: fk.fkColumn,
                            table2: tableName,
                            column2: column
                        };
                    }               
                }
            }
            
            // sort tables for writing in the correct order (fk constraints)
            this.tables.sort((a,b)=>{
                var t1 = this.fkmap[a];
                var t2 = this.fkmap[b];
                //if (is.undefined(t1)) return 1;
                //if (is.undefined(t2)) return -1;
                if (t1.table2 === b) return -1;
                if (t2.table2 === a) return 1;
                return 0;
            });
            //console.log(this.tables);
        
            /*
            console.group(this.tableName);        
            console.log(this.fkmap);
            console.groupEnd();
            */
            ready.then(()=>{
                // map tables for joins
                var tableSchema = context.tableSchemaMap[this.tableName];
                for (var prop in tableSchema){
                    this[prop] = tableSchema[prop];
                }
                
                this.tblmap[this.tableName] = tableSchema;
                for (var i=0; i<this.navigationTables.length; i++){        
                    var tableName = this.navigationTables[i];
                    this.tblmap[tableName] = this.context.tableSchemaMap[tableName];//db.getSchema().table(tableName);                        
                }
        
                for (var i=0; i<this.navigationTables.length; i++){ 
                    var tableName = this.navigationTables[i];
                    var fk = this.fkmap[tableName];       
                    var p = { 
                        table: this.tblmap[tableName],
                        predicateleft: this.tblmap[fk.table2][fk.column2],
                        predicateright: this.tblmap[fk.table1][fk.column1]
                    };
                    this.join.push(p);
                }               
            }); 
    
        }
            
        public put(entity: any) : Promise<any> {
            var entities: DBModel[];
            if (is.array(entity)) entities = entity; else entities = [entity];   
        
            // decompose entities                
            var tables= this.context.decompose(this.tableName, entities);
            
            // calculate pkeys
            var keys = {};
            for (let tableName in tables){
                let dirtyRecords = tables[tableName];
                if (dirtyRecords.length > 0){                    
                    keys[tableName] = this.put_calculateKeys(dirtyRecords,tableName);                    
                }                   
            }                                    
            
            // calculate fkeys
            for (var i=0; i<entities.length; i++){
                this.put_calculateForeignKeys(this.tableName, entities[i]);
            }
                        
            // put rows - get queries
            var q = [];
            for (var i=0; i< this.tables.length; i++){ // use this.tables since its presorted for inserts
                let tableName = this.tables[i];            
                let dirtyRecords = tables[tableName];
                if (dirtyRecords.length > 0){                    
                    q.push(this.put_execute(dirtyRecords, tableName, this.context.db, keys));                                        
                }                   
            } 
            
            // execute / attach
            
            return this.context.execMany(q).then(
            
            r=>{
                // return just the ids for the root entitiy
                var ids = entities.map((value: DBModel, index: number, array: DBModel[])=>{
                    return value[this.pk];
                });
                if (ids.length === 1) return ids[0];
                else return ids;                
            },
            e=>{
                for (let tableName in tables){
                    var rollback = keys[tableName];
                    if (rollback) {
                        if (rollback.dbtsIndex) this.context.rollbackKeys('dbtimestamp', rollback.dbtsIndex)                    
                        this.context.rollbackKeys(tableName, rollback.index);
                    }
                }
                throw e;
            });
        
            /*
            return Promise.all(q).then(()=>{ 
            
                // return just the ids for the root entitiy
                var ids = entities.map((value: DBModel, index: number, array: DBModel[])=>{
                    return value[this.pk];
                });
                if (ids.length === 1) return ids[0];
                else return ids;
            });    */           
        }
        
        private put_calculateForeignKeys(table:string, entity:DBModel, parent?:DBModel, parentTable?: string){
    
            for (var prop in entity){
                var nav = this.context.dbInstance.nav[table][prop];        
                if (nav !== undefined){
                    var fkColumns = this.context.dbInstance.fk[nav.tableName];
                    var parentFkColumns = this.context.dbInstance.fk[table];
                    var value = entity[prop];
                    parent = entity;
                    if (is.array(value)){
                        for (var i=0; i<value.length; i++){
                            calculateForeignKeys(value[i],entity, fkColumns, parentFkColumns, nav.tableName, table);
                            this.put_calculateForeignKeys(nav.tableName, value[i], parent, table);
                        }
                    }
                    else if (is.object(value)){
                        calculateForeignKeys(value,entity, fkColumns, parentFkColumns, nav.tableName, table);
                        this.put_calculateForeignKeys(nav.tableName, value, parent, table);
                    }                
                }
            }
            
            function calculateForeignKeys(entity: DBModel, parent:DBModel, fkColumns: Object, parentFkColumns: Object, table:string, parentTable:string){
                
                
                for (var column in parentFkColumns){
                    var fkInfo = parentFkColumns[column];
                    if (fkInfo.fkTable === table){                   
                    parent[column] = entity[fkInfo.fkColumn]; 
                    }
                }
                
                for (var column in fkColumns){
                    var fkInfo = fkColumns[column];            
                    if (fkInfo.fkTable === parentTable){                   
                    entity[column] = parent[fkInfo.fkColumn]; 
                    }
                }
            }                
        }
        
        
        private put_calculateKeys(dirtyRecords: DBModel[], tableName:string){
            
            var pk = this.context.dbInstance.pk[tableName];
            
            // select all of the rows without a key
            var missingKey: number[] = [];
            for (var i=0; i< dirtyRecords.length; i++) {                            
                if (dirtyRecords[i][pk] === undefined) missingKey.push(i);
            }
            
            // allocate keys
            var idIndex = this.context.allocateKeys(tableName, missingKey.length);
            
            // insert keys
            for (var i=0; i< missingKey.length; i++){                            
                dirtyRecords[missingKey[i]][pk] = idIndex + i;
            }
            
            // add dbTimestamp (optional)
            var dbTimeStampColumn = this.context.dbInstance.options[tableName].dbtimestamp;
            var dbTimeStampIndex;
            if (dbTimeStampColumn){
                dbTimeStampIndex = this.context.allocateKeys('dbtimestamp', dirtyRecords.length)
                
                for (var i=0; i< dirtyRecords.length; i++) {                            
                    dirtyRecords[i][dbTimeStampColumn] = dbTimeStampIndex+i;
                }
            }
            
            // add optional isDeleted column
            var isDeletedColumn = this.context.dbInstance.options[tableName].isdeleted;
            if (isDeletedColumn){
                for (var i=0; i< dirtyRecords.length; i++) {                            
                    dirtyRecords[i][isDeletedColumn] = false;
                }
            }
                        
            
            return {
                index: idIndex,
                dbtsIndex: dbTimeStampIndex
            }                     
        }
        
        private put_execute(dirtyRecords: DBModel[], tableName:string, db: lf.Database, keys: Object){
            //return new Promise((resolve,reject)=>{
                
                
                // create rows                                
                var table = this.context.tableSchemaMap[tableName];//db.getSchema().table(tableName);
                var columns = this.context.dbInstance.schema[tableName];
                var rows: lf.Row[] = [];
                for (var i=0; i< dirtyRecords.length; i++){
                    var e = dirtyRecords[i];
                    var row = {};
                    for(var x=0; x< columns.length ; x++){
                        var column = columns[x];
                        row[column] = e[column];
                    }
                    rows.push(table.createRow(row));
                }                
            
                // upsert query                          
                var q = db.insertOrReplace().into(table).values(rows);
                return q;
                /*
                this.context.exec(q).then(
                    r=>{resolve(r)},
                    e=>{
                        var rollback = keys[tableName];
                        if (rollback.dbtsIndex) this.context.rollbackKeys('dbtimestamp', rollback.dbtsIndex)                    
                        this.context.rollbackKeys(tableName, rollback.index);
                        reject(e);
                    });
                */
            //})        
        }
        
        public get(id: any): Promise<any> {        
            return this._get(id).then((results)=>{            
                var entities = this.context.compose(this.tableName, results, this.fkmap);
                if (is.array(id) || is.undefined(id)) return entities;
                else return entities[0];
            });
            
        }    
    
        public _get(id:any, forcePurge?: boolean): Promise<any> {
            var db = this.context.db;
            var table = this.context.tableSchemaMap[this.tableName];//db.getSchema().table(this.tableName); 
            var query = this._query(db,table);
            var pk = this.context.dbInstance.pk[this.tableName];
            var dk = this.context.dbInstance.options[this.tableName]['isdeleted']; 
            if (dk === undefined){
                if (is.array(id))
                    query.where(table[pk].in(id));
                else if (is.number(id))
                    query.where(table[pk].eq(id));            
            }
            else {
                if (is.array(id))
                    query.where(lf.op.and(table[pk].in(id),table[dk].eq(false)));
                else if (is.number(id))
                    query.where(lf.op.and(table[pk].eq(id),table[dk].eq(false)));
                else if (is.undefined(id) && !forcePurge) // id is undefined
                    query.where(table[dk].eq(false));
            }        
            return this.context.exec(query);//query.exec();
        }
    
        public query( context: (ctx:E_CTX, query:DBQuery<T>)=>any ): Promise<T[]> {
            var db = this.context.db;
            var table = this.context.tableSchemaMap[this.tableName];
            var query = this._query(db,table);    
            
            return context(<E_CTX>this.tblmap, 
                new QueryService<T>(query,this.context, this.tableName, this.fkmap, this.tblmap));                
    
        }
        
        public count( context: (ctx:E_CTX, query:DBCount<T>)=>any ): Promise<number> {
            var db = this.context.db;
            var table = this.context.tableSchemaMap[this.tableName];     
            var pk = this.context.dbInstance.pk[this.tableName];
            var query = this._query(db,table, [lf.fn.count(table[pk])]);            
            
            return context(<E_CTX>this.tblmap, 
                new CountService<T>(query,this.context, this.tableName, this.fkmap, this.tblmap));                
    
        }
        
        public select( context: (ctx:T_CTX, query:DBQuery<T>)=>any ): Promise<T[]> {
            var db = this.context.db;
            var table = this.context.tableSchemaMap[this.tableName];     
            var query = this._query(db,table,undefined,false);    
                    
            return context(<T_CTX>this.tblmap[this.tableName], 
                new SelectService<T>(query,this.context, this.tableName, this.fkmap, this.tblmap));                
    
        }    
            
        // used by both get and query
        private _query(db: lf.Database, table: lf.schema.Table, columns?: lf.schema.Column[], joinNavTables?: boolean) : lf.query.Select
        {       
            if (joinNavTables===undefined) joinNavTables=true; 
            // execute query            
            var query = columns ? db.select(...columns).from(table) : db.select().from(table);
            if (joinNavTables){
                for (var i=0; i< this.join.length; i++){
                    query.innerJoin(this.join[i].table, this.join[i].predicateleft.eq(this.join[i].predicateright))            
                }
            }
            return query;        
            
        }
        
        //public purge(): Promise<any> {
        //    return this.delete(undefined, true);
        //}
        public delete(id: any, forcePurge?:boolean): Promise<any> {
    
            return this._get(id, forcePurge).then(results=>{
    
                // distinct  - flatten and remove duplicates resulting for joins
                var map = {};  
                var keys = {};                     
                for (var i=0; i<results.length; i++){
                    var result = results[i];                
                    for (var table in result){
                        var pk = this.context.dbInstance.pk[table];
                        var row = result[table];
                        var key = row[pk];
                                    
                        if (keys[table]===undefined) {
                            keys[table] = [ key ];
                            map[table] = [ row ];
                        }
                        else {
                            if (keys[table].indexOf(key) === -1){
                                keys[table].push( key );
                                map[table].push( row );
                            }
                        }
                    }
                }
                
                // delete or flag depending on settings
                var db = this.context.db;
                var qq = [];
                for (var tableName in map){
                    var pk = this.context.dbInstance.pk[tableName];
                    var table = this.tblmap[tableName];
                    var keyList = keys[tableName];
                    
                    var dk = this.context.dbInstance.options[tableName]['isdeleted']; 
                    if (dk=== undefined || forcePurge=== true) {
                        let q= db.delete().from(table).where(table[pk].in(keyList))
                        qq.push(q);              
                        //q.push(db.delete().from(table).where(table[pk].in(keyList)).exec());
                    }
                    else{
                        let q = db.update(table).set(table[dk],true).where(table[pk].in(keyList))
                        qq.push(q);
                        //q.push(db.update(table).set(table[dk],true).where(table[pk].in(keyList)).exec());
                    }
                        
                }
                
                return this.context.execMany(qq);
                //return Promise.all(promises);    
            });
        }    
    }
    
    class QueryServiceBase<T> {
        protected query: lf.query.Select; 
        protected context: DBContextInternal;
        protected tableName: string;
        protected fkmap: Object;
        protected tblmap: Object;
                
        //where(predicate: Predicate): Select
        public where(predicate: lf.Predicate): QueryServiceBase<T> {
            var table = this.tblmap[this.tableName];
            var dk = this.context.dbInstance.options[this.tableName]['isdeleted']; 
            if (dk === undefined){
                this.query.where(predicate);           
            }
            else {
                this.query.where(lf.op.and(predicate,table[dk].eq(false)));
            }        
            return this;
        }  
        
        //bind(...values: any[]): Builder
        
        //explain(): string
        public explain():string {
            return this.query.explain();
        }
        //toSql(): string
        public toSql():string {
            return this.query.toSql();
        }        
    }
    class CountService<T> extends QueryServiceBase<T> implements DBCount<T> {
    
        constructor(
            protected query: lf.query.Select, 
            protected context: DBContextInternal,
            protected tableName: string,
            protected fkmap: Object,
            protected tblmap: Object){
                super();
            }
            
        public where(predicate: lf.Predicate): CountService<T> {
            super.where(predicate);        
            return this; 
        }        
        public exec() : number {        
            var pk = this.context.dbInstance.pk[this.tableName];
            return this.context.exec(this.query).then((results)=>{    
                var count = results[0][this.tableName][`COUNT(${pk})`];
                return count;
            });
        }        
    }
    class QueryService<T> extends QueryServiceBase<T> implements DBQuery<T> {
        
        constructor(
            protected query: lf.query.Select, 
            protected context: DBContextInternal,
            protected tableName: string,
            protected fkmap: Object,
            protected tblmap: Object){
                super()
            }
        
        //groupBy(...columns: schema.Column[]): Select
        
        public groupBy(...columns: lf.schema.Column[]): QueryService<T> {
            this.query.groupBy.apply(this,columns);
            return this;        
        }
        
        //limit(numberOfRows: Binder|number): Select
        public limit(numberOfRows: lf.Binder|number): QueryService<T>{
            this.query.limit(numberOfRows);
            return this;
        }
        
        //orderBy(column: schema.Column, order?: Order): Select
        public orderBy(column: lf.schema.Column, order?: lf.Order): QueryService<T> {
            this.query.orderBy(column, order);
            return this;
        }
        
        //skip(numberOfRows: Binder|number): Select
        public skip(numberOfRows: lf.Binder|number): QueryService<T> {
            this.query.skip(numberOfRows);
            return this;
        }
        
    
        public where(predicate: lf.Predicate): QueryService<T> {
            super.where(predicate);        
            return this; 
        }
    
        //exec(): Promise<Array<Object>>
        public exec() : Promise<T[]> {
            //return this.query.exec().then((results)=>{
            return this.context.exec(this.query).then((results)=>{    
                var entities = this.context.compose(this.tableName, results, this.fkmap);
                return entities;
            });
        }
    }
    
    class SelectService<T> extends QueryServiceBase<T> implements DBQuery<T> {
        
        constructor(
            protected query: lf.query.Select, 
            protected context: DBContextInternal,
            protected tableName: string,
            protected fkmap: Object,
            protected tblmap: Object){
                super()
            }
        
        //groupBy(...columns: schema.Column[]): Select
        
        public groupBy(...columns: lf.schema.Column[]): SelectService<T> {
            this.query.groupBy.apply(this,columns);
            return this;        
        }
        
        //limit(numberOfRows: Binder|number): Select
        public limit(numberOfRows: lf.Binder|number): SelectService<T>{
            this.query.limit(numberOfRows);
            return this;
        }
        
        //orderBy(column: schema.Column, order?: Order): Select
        public orderBy(column: lf.schema.Column, order?: lf.Order): SelectService<T> {
            this.query.orderBy(column, order);
            return this;
        }
        
        //skip(numberOfRows: Binder|number): Select
        public skip(numberOfRows: lf.Binder|number): SelectService<T> {
            this.query.skip(numberOfRows);
            return this;
        }
        
    
        public where(predicate: lf.Predicate): SelectService<T> {
            super.where(predicate);        
            return this; 
        }
    
        //exec(): Promise<Array<Object>>
        public exec() : Promise<T[]> {
            //return this.query.exec().then((results)=>{
            return this.context.exec(this.query).then((results)=>{    
                return results;
            });
        }
    }
    
    // general purpos helpers
    class is {
        public static array(x:any){
            return Array.isArray(x);
        }
        public static number(x:any){
            return (typeof(x)==='number');
        }
        public static string(x:any){
            return (typeof(x)==='string');
        }    
        public static object(x:any){
            return (typeof(x)==='object');
        }
        public static undefined(x:any){
            return x === undefined;
        }
    }
    
    class StringUtils {
        public static removeWhiteSpace(str: string) : string {
            return str.replace(/\s/g, "");
        }
    }
    
    class PromiseUtils {
        
        // execute functions returning promises sequentially
        public static serial(...items: any[][]) {
            if (items.length ===1) items = items[0];
            items.reverse(); // reverse so that pops come off of the bottom instead of the top.    
            
            return new Promise((resolve,reject)=>{
                _sequence(items, resolve, reject);                    
            })
            
            function _sequence(items: any[][], resolve, reject ) {
                var d = items.pop();            
                if (d){
                    var fn : (...args:any[]) => Promise<any> = d.splice(0,1)[0];
                    var args = d;        
                    fn.apply(this,args).then(()=>{ _sequence(items, resolve,reject);})
                }
                else {
                    resolve();
                }
            }
        }    
    }
    
    class Load {
        private static cache = {};
        
        public static json(url: string, async?: boolean, cache?:boolean) : any {        
    
            if (cache){
                var cachedResponse = this.cache[url];
                if (cachedResponse){
                    if (async){
                        return new Promise((resolve,reject)=>{
                            resolve(JSON.parse(cachedResponse));
                        })
                    }
                    else {
                        return JSON.parse(cachedResponse);
                    }
                }
            }
            
            var xmlhttp = new XMLHttpRequest();
            xmlhttp.onreadystatechange = function () {
                if (xmlhttp.readyState == 4) {
                    if (async) {
                        if (xmlhttp.status == 200){
                            
                            if (cache) this.cache[url] = xmlhttp.responseText;
                            return new Promise((resolve,reject)=>{
                                resolve(JSON.parse(cachedResponse));
                            });                        
                        
                        }
                        else {
                            return new Promise((resolve,reject)=>{
                                reject(xmlhttp.status);
                            });    
                        }
                    }
                }
            };
            
            
            xmlhttp.open("GET", url, async);
            xmlhttp.send();
            if (!async){
                if (xmlhttp.status == 200){
                    if (cache) this.cache[url] = xmlhttp.responseText;
                    return JSON.parse(xmlhttp.responseText);
                }
                else{
                    return xmlhttp.status;
                }
            }
        }    
    }   
}
