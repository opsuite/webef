/// <reference path="../../typings/tsd.d.ts" />


export class DBContext {
    
    private internal: DBContextInternal = new DBContextInternal();
    
    constructor(dbName: string, dbVersion?: number , dbSizeMb?:number, dbDescription?:string) {
        
        if (window.openDatabase) {
            
            if (dbVersion === undefined) dbVersion = 1;
            if (dbSizeMb === undefined) dbSizeMb = 1;
            if (dbDescription === undefined) dbDescription = '';
            
            this.internal.db = window.openDatabase(dbName, /*database name*/
                                    dbVersion.toString(), /* version number */
                                    dbDescription, /* db description */
                                    dbSizeMb * 1024 * 1024 /* db size 1024*1024 = 1MB */);                
        } else {
            throw ('WebSQL not supported in this browser! Try Google Chrome or Safari :)');
        }
    }
    
    private sqlError(err:SQLError){
        console.error(err.message);
    }
    
    public transaction( callback: ()=>void ){
        return new Promise((resolve, reject)=>{
            this.internal.db.transaction(tx => {
                this.internal.tx = tx;
                callback();
            }, 
            err=>{
                this.sqlError(err); 
                reject();
            }, 
            resolve)
        });       
    }
    
    protected DBEntity<T>( mapping: Object ) {
        return new DBEntity<T>(mapping, this, this.internal);  
    }
}

export class DBContextInternal{

    public db: Database;
    public tx: SQLTransaction;    
    public get sqltype(){ 
        return {
        'int': 'INTEGER',
        'real': 'NUMERIC',
        'decimal': 'NUMERIC',
        'float': 'NUMERIC',
        'text': 'TEXT',
        'string': 'TEXT',
        'blob': 'BLOB',
        'date': 'TEXT',
        'time': 'TEXT',
        'datetime': 'TEXT',
        'timespan': 'INT',
        'object': 'BLOB',
        'null': 'NULL',
        'undefined': 'NULL',
        'pk': 'INTEGER PRIMARY KEY ASC',
        'pkey': 'INTEGER PRIMARY KEY ASC',
        'key': 'INTEGER PRIMARY KEY ASC',
        'fkey': 'INTEGER', //'#fk# INTEGER, FOREIGN KEY (#fk#) REFERENCES #tbl# (#k#)',
        'fk': 'INTEGER', //'#fk# INTEGER, FOREIGN KEY (#fk#) REFERENCES #tbl# (#k#)',
    }}
    public tables: string[] = [];
    public metaData: {} = {};

    public get typeconvert() {
        return {
            toJS(value: any, type: string) {
    
                if (type === 'date' || type === 'time' || type === 'datetime') {
                    if (value === null || value === '') {
                        return null;
                    }
                    let date = new Date(value); // sql treats null dates as 01/01/1900
                    if (date.getFullYear() <= 1900) {
                        date = null;
                    }
                    return date;
                } else if (type === 'bool' || type === 'boolean') {
                    if (value !== null) {
                        return (value !== 0);
                    }
                }
                return value;
            },
            fromJS(value: any) {
                if (value instanceof Date) {
                    return ISODateString(value);
                } else if (typeof value === 'boolean') {
                    if (value !== null) {
                        return value ? 1 : 0;
                    }
                }
                return value;
            }
    
        };

        /* Use a function for the exact format desired... */
        function ISODateString(d: any) {
            function pad(n: any) {
                return n < 10 ? `0${n}` : n
            }
    
            return d.getUTCFullYear() + '-'
                + pad(d.getUTCMonth() + 1) + '-'
                + pad(d.getUTCDate()) + 'T'
                + pad(d.getUTCHours()) + ':'
                + pad(d.getUTCMinutes()) + ':'
                + pad(d.getUTCSeconds()) + 'Z';
        }
    }
    
    public sqlError(err: any, sql: any, source?: any, entity?: any) {
        console.error(((undefined !== source) ? source : '') + '\nerror: ' +
                    ((undefined !== err.message) ? err.message : err) + '\nsql: "' + sql + '"' +
                    ((undefined !== entity) ? (
                        `\nentity: ${JSON.stringify(entity, null, 4)}`) : ''));
    }

    public sqlResultToArray(result: any) {
        var tmp: any[] = [];
        for (var i = 0; i < result.rows.length; i++) {
            tmp.push(result.rows.item(i));
        }
        return tmp;
    }
        
} // end DBContextInternal

interface DBEntityMetaData {
    fkeys: string[];
    columns: string;
    nav: string;
    table: string;
    schema: string;
    key: string;
}
export class DBEntity<T> {
	
    private context: DBContext;
    private internal: DBContextInternal;
    private metaData: DBEntityMetaData;
    
	constructor(schema: Object, context: DBContext, internal: DBContextInternal){		
        this.context = context;
        this.internal = internal;
        		
		for (var table in schema) {
            internal.tables.push(table);                        
            
            var tableDef = schema[table];
            var columns: any[] = [];
            var pkey: any;
            var navProperties = {};
            var fkeys = {};
            var tableSchema = {};
            var objColumns: any[] = [];
                  
			for (var column in tableDef){
                var type = tableDef[column];
                // special case for foreign keys
                var foreignTable: any;
                var foreignColumn: any;
                var tokens: any;
                var typeAffinity: any;
                var columnDescriptor: string;
                if (type.indexOf('fk') === 0) {
                    tokens = type.split(':');
                    type = tokens[0].trim();
                    var tmp = tokens[1];
                    tokens = tmp.split('.');
                    foreignTable = tokens[0].trim();
                    foreignColumn = tokens[1].trim();
                    fkeys[column] = {
                        table: foreignTable,
                        column: foreignColumn
                    };
                    tableSchema[column] = 'int';
                    //pkey=column;
                    typeAffinity = internal.sqltype[type];
                    columnDescriptor = column + ' ' + typeAffinity;
                    columns.push(columnDescriptor);
                    objColumns.push(table + '.' + column + ' as \'' + table + '.' +
                                    column + '\'');
                }
                // special case for navigation properties
                else if (type.indexOf('nav') === 0) {
                    tokens = type.split(':');
                    tokens = tokens[1].split('.');
                    var navTable = tokens[0].trim();
                    navProperties[column] = {
                        table: navTable,
                        fkey: tokens[1].trim(),
                        oneToMany: (navTable != table)
                    };
                } else if (type === 'pkey') {
                    pkey = column;
                    tableSchema[column] = 'int';
                    typeAffinity = internal.sqltype[type];
                    columnDescriptor = column + ' ' + typeAffinity;
                    columns.push(columnDescriptor);
                    objColumns.push(table + '.' + column + ' as \'' + table + '.' +
                                    column + '\'');
                } else {
                    // get affinity of column
                    typeAffinity = internal.sqltype[type];
                    columnDescriptor = column + ' ' + typeAffinity;
                    columns.push(columnDescriptor);
                    tableSchema[column] = type;
                    objColumns.push(table + '.' + column + ' as \'' + table + '.' +
                                    column + '\'');
                }
				
			}
            if (pkey === undefined) {
                throw('Table "'+table+'" did not specify a primary key which was required.');
            }

            context.transaction(()=>{
                var sql = `CREATE TABLE IF NOT EXISTS [${table}] (${columns.join(', ')})`;
                internal.tx.executeSql(sql);
            })

            // add table to service
            internal.metaData[table] = {
                'fkeys': fkeys,
                'columns': objColumns.join(','),
                'nav': navProperties,
                'table': table,
                'schema': tableSchema,
                'key': pkey,
            };
            this.metaData = internal.metaData[table];
		}
	}
    
	public put(row: T, identityInsert?:boolean) : Promise<any>;
	public put(rows: T[], identityInsert?:boolean) : Promise<any>;
	public put(arg: any, identityInsert?:boolean) : Promise<any> {
		
		var entity: T,
			rows: T[];
		if (typeof(arg) === 'array') rows = arg;
		else rows = [arg];
		
        
        var key = this.metaData.key;
        var table = this.metaData.table;
        var tx = this.internal.tx;
        var q=[];
		for (var i=0; i<rows.length; i++){
			entity = rows[i];
            q.push(new Promise((success, failure)=>{

                var sql: any;
                var columns: any[] = [];
                var values: any[] = [];
                var keyVal: any;
                var hasKey = false;
                
                for (var column in entity) {
                    if (column === key) {
                        keyVal = entity[column];
                        hasKey = true;
                        if (identityInsert) {
                            const value = this.internal.typeconvert.fromJS(entity[column]);
                            values.push(value);
                            columns.push(column);
                        }
                    } else {
                        const value = this.internal.typeconvert.fromJS(entity[column]);
                        values.push(value);
                        columns.push(column);
                    }
                    if (undefined === key ) {
                        hasKey = false;
                    } //no pkey defined so treat all puts as inserts
                }
                
                var returnFirst = (tx: any, results: any) => {
                    // Todo: make insert id available for updates
                    try {
                        const id = results.insertId;
                        success(results.insertId); // only seems to be defined for inserts
                    } catch (e) {
                        success();
                    }
                };
                
                var putError = err => {
                    this.internal.sqlError(err, sql, `websql.${table}.put()`, entity);
                    failure(err);
                    return true; // this causes the rollback
                };
                
                var doUpsert = dbTransaction => {
                    function tryExecute() {
                        try {
                            execute(dbTransaction);
                        } catch (ex) {
                            if (ex.code === 11) // invalid state error
                            {
                                // the transaction is in an invalid state
                                // probably because it has been closed.
                                // so try to create a new one
                                //this.context.db.transaction(execute, putError);
                                debugger;
                                //throw ex;
    
                            } else {
                                throw ex;
                            }
                        }
                    }
    
                    function execute(dbTransaction: any) {
                        //internal.transactionCache = dbTransaction;
                        dbTransaction.executeSql(sql, values, returnFirst);
                    }
    
                    if (hasKey && !identityInsert) {
                        values.push(keyVal);
                        var parts: any[] = [];
                        for (var i = 0; i < columns.length; i++) {
                            parts.push(columns[i] + '=?');
                        }
                        // update record
                        sql = `UPDATE [${table}] SET ${parts.join(',')} WHERE ${key}=?`;
                        //internal.sqlCache = sql;
    
                        tryExecute();
    
                    } else {
                        var parts: any[] = [];
                        for (var i = 0; i < columns.length; i++) {
                            parts.push('?');
                        }
                        // insert record
                        sql = `INSERT INTO [${table}] (${columns.join(',')}) VALUES (${parts.join(',')})`;
                        //internal.sqlCache = sql;
    
                        tryExecute();
                    }
                };
    
    
                if (tx) {
                    doUpsert(tx);
                } else {
                    this.internal.db.transaction(doUpsert, putError);
                }
    
                
            })); // end promise
		}// end for
		
        return Promise.all(q);
	}
}