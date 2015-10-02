/*-----------------------------------------------------------------------------
| Copyright (c) 2015, Positive Technology
| Distributed under the terms of the MIT License.
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
/// <reference path="../typings/tsd.d.ts" />
require('google/lovefield');
var DBSchema = (function () {
    function DBSchema() {
    }
    DBSchema.create = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i - 0] = arguments[_i];
        }
        var dbName, dbVersion, schema;
        if (args.length === 3) {
            dbName = args[0];
            dbVersion = args[1];
            schema = args[2];
        }
        else if (args.length === 1) {
            var data = Load.json(args[0]);
            dbName = data.name;
            dbVersion = data.version;
            schema = data.schema;
        }
        var schemaBuilder = lf.schema.create(dbName, dbVersion);
        var columns = {};
        var nav = {};
        var fk = {};
        var pk = {};
        var tables = [];
        var options = {};
        for (var table in schema) {
            var tableSchema = schema[table];
            var tb = schemaBuilder.createTable(table);
            tables.push(table);
            var nullables = [];
            var indeces = [];
            columns[table] = [];
            nav[table] = {};
            fk[table] = {};
            options[table] = {};
            var pkeys = [];
            for (var column in tableSchema) {
                var typeDef = StringUtils.removeWhiteSpace(tableSchema[column]);
                var isColumn = true;
                var isPkey = false;
                if (typeDef.indexOf('pkey') === 0) {
                    tb.addColumn(column, lf.Type.INTEGER);
                    isPkey = true;
                    pkeys.push(column);
                    pk[table] = column;
                }
                else if (typeDef.indexOf('string') === 0) {
                    tb.addColumn(column, lf.Type.STRING);
                }
                else if (typeDef.indexOf('date') === 0) {
                    tb.addColumn(column, lf.Type.DATE_TIME);
                }
                else if (typeDef.indexOf('boolean') === 0) {
                    tb.addColumn(column, lf.Type.BOOLEAN);
                }
                else if (typeDef.indexOf('int') === 0) {
                    tb.addColumn(column, lf.Type.INTEGER);
                }
                else if (typeDef.indexOf('float') === 0) {
                    tb.addColumn(column, lf.Type.NUMBER);
                }
                else if (typeDef.indexOf('object') === 0) {
                    tb.addColumn(column, lf.Type.OBJECT);
                }
                else if (typeDef.indexOf('array') === 0) {
                    tb.addColumn(column, lf.Type.ARRAY_BUFFER);
                }
                else if (typeDef.indexOf('fkey') === 0) {
                    tb.addColumn(column, lf.Type.INTEGER);
                    nullables.push(column);
                    var x = typeDef.split(':')[1].split('.');
                    fk[table][column] = {
                        columnName: column,
                        fkTable: x[0],
                        fkColumn: x[1]
                    };
                }
                else if (typeDef.indexOf('nav->') == 0) {
                    isColumn = false;
                    var x = typeDef.split('>')[1].split(':');
                    var y = x[1].split('.');
                    var tableName = x[0];
                    var fkTable = y[0];
                    var fkColumn = y[1];
                    nav[table][column] = {
                        columnName: column,
                        tableName: tableName,
                        fkTable: fkTable,
                        fkColumn: fkColumn,
                        isArray: (fkTable === tableName)
                    };
                }
                else if (typeDef.indexOf('dbtimestamp') === 0) {
                    tb.addColumn(column, lf.Type.INTEGER);
                    options[table]['dbtimestamp'] = column;
                }
                else if (typeDef.indexOf('isdeleted') === 0) {
                    tb.addColumn(column, lf.Type.BOOLEAN);
                    options[table]['isdeleted'] = column;
                }
                if (isColumn) {
                    // add indeces and unique constraints if requested
                    var ops = typeDef.split(',');
                    if (ops.indexOf('index') !== -1) {
                        var unique = (ops.indexOf('unique') !== -1);
                        indeces.push(column);
                    }
                    if (ops.indexOf('null') !== -1)
                        nullables.push(column);
                    columns[table].push(column);
                }
            }
            if (pkeys.length === 0)
                throw "Schema Error: no primary key was specified for table '" + table + "'";
            if (pkeys.length > 1)
                throw "Schema Error: more than one primary key was specified for table '" + table + "'";
            tb.addPrimaryKey(pkeys);
            tb.addNullable(nullables);
            tb.addIndex("ix_" + table, indeces);
        }
        DBSchemaInternal.instanceMap[dbName] =
            new DBInstance(dbName, dbVersion, schemaBuilder, columns, nav, tables, fk, options, pk);
    };
    return DBSchema;
})();
exports.DBSchema = DBSchema;
var DBSchemaInternal = (function () {
    function DBSchemaInternal() {
    }
    DBSchemaInternal.instanceMap = {};
    return DBSchemaInternal;
})();
var DBInstance = (function () {
    function DBInstance(dbName, dbVersion, schemaBuilder, schema, nav, tables, fk, options, pk) {
        this.dbName = dbName;
        this.dbVersion = dbVersion;
        this.schemaBuilder = schemaBuilder;
        this.schema = schema;
        this.nav = nav;
        this.tables = tables;
        this.fk = fk;
        this.options = options;
        this.pk = pk;
    }
    DBInstance.prototype.newTableMap = function () {
        var map = {};
        for (var i = 0; i < this.tables.length; i++) {
            map[this.tables[i]] = [];
        }
        return map;
    };
    return DBInstance;
})();
var DBContext = (function () {
    function DBContext(dbName, dbStoreType, dbSizeMB) {
        var _this = this;
        this.loading = false;
        this.loaded = false;
        this.context = new DBContextInternal();
        this.context.dbStoreType = (dbStoreType === undefined) ? lf.schema.DataStoreType.WEB_SQL : dbStoreType;
        this.context.dbInstance = DBSchemaInternal.instanceMap[dbName];
        var dbSize = (dbSizeMB || 1) * 1024 * 1024; /* db size 1024*1024 = 1MB */
        var self = this;
        this.ready = new Promise(function (resolve, reject) {
            try {
                _this.context.dbInstance.schemaBuilder.connect({
                    storeType: self.context.dbStoreType,
                    webSqlDbSize: dbSize })
                    .then(function (db) {
                    _this.context.db = db;
                    // get schema for tables
                    _this.context.tableSchemaMap = _this.context.dbInstance.newTableMap();
                    _this.context.tables = [];
                    for (var table in _this.context.tableSchemaMap) {
                        var t = _this.context.db.getSchema().table(table);
                        _this.context.tableSchemaMap[table] = t;
                        _this.context.tables.push(t);
                    }
                    resolve();
                });
            }
            catch (e) {
                reject(e);
            }
        });
    }
    // this will delete all rows from all tables ad purge all key and dbtimestamp indeces 
    DBContext.prototype.purge = function () {
        var tx = this.context.db.createTransaction();
        var q = [];
        for (var tName in this.context.tableSchemaMap) {
            var table = this.context.tableSchemaMap[tName];
            q.push(this.context.db.delete().from(table));
            this.context.purgeKeys(tName);
        }
        this.context.purgeKeys('dbtimestamp');
        return tx.exec(q);
    };
    // open a new transaction with an exclusive lock on the specified tables
    DBContext.prototype.transaction = function (fn) {
        var _this = this;
        this.context.tx = this.context.db.createTransaction();
        // get a lock on all the tables in the DBContext
        return this.context.tx.begin(this.context.tables).then(function () {
            var p = fn(_this.context.tx, _this.context.tableSchemaMap).then(function () {
                _this.context.tx.commit();
                _this.context.tx = undefined;
            });
            return p;
        });
    };
    Object.defineProperty(DBContext.prototype, "tables", {
        get: function () {
            return this.context.tableSchemaMap;
        },
        enumerable: true,
        configurable: true
    });
    DBContext.prototype.select = function () {
        var columns = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            columns[_i - 0] = arguments[_i];
        }
        return this.context.db.select.apply(this.context.db, columns);
    };
    DBContext.prototype.getCheckpoint = function () {
        if (!localStorage)
            throw new Error('localstorage not supported!');
        var key = "" + this.context.dbInstance.dbName + this.context.dbStoreType + ".dbtimestamp.masterIndex";
        var s = localStorage.getItem(key);
        if (!s)
            return 0;
        var n = parseInt(s);
        if (isNaN(n))
            return 0;
        return n;
    };
    DBContext.prototype.DBEntity = function (tableName, navigationProperties) {
        return (new DBEntityInternal(this.context, tableName, navigationProperties, this.ready));
    };
    return DBContext;
})();
exports.DBContext = DBContext;
// private classes
var DBContextInternal = (function () {
    function DBContextInternal() {
    }
    DBContextInternal.prototype.compose = function (table, rows, fkmap) {
        var map = fkmap[table];
        // if there are no foreign keys there is nothing more to compose
        if (map === undefined)
            return rows;
        var key = map.column2;
        // entities
        var entities = [];
        var distinct = [];
        var keyvalues = {};
        for (var i = 0; i < rows.length; i++) {
            var row_1 = rows[i];
            var keyvalue_1 = row_1[table][key];
            if (undefined === keyvalues[keyvalue_1]) {
                keyvalues[keyvalue_1] = entities.length; //store the index
                var first = row_1[table]; // only save the first element with this keyvalue
                // clone before making modification to prevent lovefield index cache from
                // being corrupted
                var clone = JSON.parse(JSON.stringify(first));
                entities.push(clone);
            }
            var index = keyvalues[keyvalue_1];
            if (distinct[index] === undefined)
                distinct[index] = [];
            distinct[index].push(row_1); // store the row in a lookup table
        }
        for (var keyvalue in keyvalues) {
            var index_1 = keyvalues[keyvalue];
            rows = distinct[index_1];
            // position children (recursive)
            for (var z = 0; z < rows.length; z++) {
                // clone before making modification to prevent lovefield index cache from
                // being corrupted
                var row = JSON.parse(JSON.stringify(rows[z]));
                this.compose_(table, row, entities[index_1]);
            }
        }
        return entities;
    };
    DBContextInternal.prototype.compose_ = function (table, row, parent) {
        var navs = this.dbInstance.nav[table];
        for (var column in navs) {
            var nav = navs[column];
            var child = row[nav.tableName];
            // bug? in some cases child is undefined
            if (child) {
                if (nav.isArray) {
                    if (undefined === parent[nav.columnName])
                        parent[nav.columnName] = [child];
                    else
                        parent[nav.columnName].push(child);
                }
                else {
                    parent[nav.columnName] = child;
                }
                this.compose_(nav.tableName, row, child);
            }
        }
    };
    DBContextInternal.prototype.decompose = function (table, entities) {
        var map = this.dbInstance.newTableMap();
        for (var i = 0; i < entities.length; i++) {
            var e = entities[i];
            map[table].push(e);
            this.decompose_(table, e, map);
        }
        return map;
    };
    DBContextInternal.prototype.decompose_ = function (table, entity, map) {
        for (var prop in entity) {
            var nav = this.dbInstance.nav[table][prop];
            if (nav !== undefined) {
                var value = entity[prop];
                if (is.array(value)) {
                    for (var i = 0; i < value.length; i++) {
                        map[nav.tableName].push(value[i]);
                        this.decompose_(nav.tableName, value[i], map);
                    }
                }
                else if (is.object(value)) {
                    map[nav.tableName].push(value);
                    this.decompose_(nav.tableName, value, map);
                }
            }
        }
    };
    DBContextInternal.prototype.allocateKeys = function (table, take) {
        var key = "" + this.dbInstance.dbName + this.dbStoreType + "." + table + ".masterIndex";
        var lsvalue = window.localStorage.getItem(key);
        var value, nextvalue;
        if (lsvalue === null)
            value = 1;
        else
            value = parseInt(lsvalue);
        nextvalue = value;
        if (!take)
            take = 1;
        nextvalue += take;
        window.localStorage.setItem(key, nextvalue.toString());
        //console.log(`${table}:${value}`);
        return value;
    };
    DBContextInternal.prototype.rollbackKeys = function (table, idIndex) {
        var key = "" + this.dbInstance.dbName + this.dbStoreType + "." + table + ".masterIndex";
        window.localStorage.setItem(key, (idIndex - 1).toString());
    };
    DBContextInternal.prototype.purgeKeys = function (table) {
        var key = "" + this.dbInstance.dbName + this.dbStoreType + "." + table + ".masterIndex";
        localStorage.removeItem(key);
    };
    DBContextInternal.prototype.exec = function (q) {
        if (this.tx) {
            return this.tx.attach(q);
        }
        else {
            return q.exec();
        }
    };
    DBContextInternal.prototype.execMany = function (q) {
        if (this.tx) {
            q = q.reverse();
            return this._execMany(q);
        }
        else {
            var tx = this.db.createTransaction();
            return tx.exec(q);
        }
    };
    DBContextInternal.prototype._execMany = function (q) {
        var _this = this;
        var q1 = q.pop();
        var a = this.tx.attach(q1);
        if (q.length === 0)
            return a;
        else
            return a.then(function () { return _this.execMany(q); });
    };
    return DBContextInternal;
})();
var DBEntityInternal = (function () {
    function DBEntityInternal(context, tableName, navigationProperties, ready) {
        var _this = this;
        this.navigationProperties = [];
        this.navigationTables = [];
        this.tables = [];
        // used for query()
        this.join = [];
        this.tblmap = {};
        this.context = context;
        this.tableName = tableName;
        this.navigationProperties = navigationProperties || [];
        this.nav = context.dbInstance.nav[tableName];
        this.pk = context.dbInstance.pk[tableName];
        for (var column in this.nav)
            this.navigationTables.push(this.nav[column].tableName);
        for (var i = 0; i < this.navigationTables.length; i++)
            this.tables.push(this.navigationTables[i]);
        this.tables.push(this.tableName);
        this.fkmap = {};
        for (var i = 0; i < this.tables.length; i++) {
            var tableName = this.tables[i];
            var fkeys = this.context.dbInstance.fk[tableName];
            // determine if there are fkeys to any navigation tables
            for (var column in fkeys) {
                var fk = fkeys[column];
                if (this.tables.indexOf(fk.fkTable) !== -1) {
                    //fkmap[tableName].push(fk);
                    this.fkmap[tableName] = {
                        table1: tableName,
                        column1: column,
                        table2: fk.fkTable,
                        column2: fk.fkColumn
                    };
                    this.fkmap[fk.fkTable] = {
                        table1: fk.fkTable,
                        column1: fk.fkColumn,
                        table2: tableName,
                        column2: column
                    };
                }
            }
        }
        // sort tables for writing in the correct order (fk constraints)
        this.tables.sort(function (a, b) {
            var t1 = _this.fkmap[a];
            var t2 = _this.fkmap[b];
            //if (is.undefined(t1)) return 1;
            //if (is.undefined(t2)) return -1;
            if (t1.table2 === b)
                return -1;
            if (t2.table2 === a)
                return 1;
            return 0;
        });
        //console.log(this.tables);
        /*
        console.group(this.tableName);
        console.log(this.fkmap);
        console.groupEnd();
        */
        ready.then(function () {
            // map tables for joins
            var tableSchema = context.tableSchemaMap[_this.tableName];
            for (var prop in tableSchema) {
                _this[prop] = tableSchema[prop];
            }
            _this.tblmap[_this.tableName] = tableSchema;
            for (var i = 0; i < _this.navigationTables.length; i++) {
                var tableName = _this.navigationTables[i];
                _this.tblmap[tableName] = _this.context.tableSchemaMap[tableName]; //db.getSchema().table(tableName);                        
            }
            for (var i = 0; i < _this.navigationTables.length; i++) {
                var tableName = _this.navigationTables[i];
                var fk = _this.fkmap[tableName];
                var p = {
                    table: _this.tblmap[tableName],
                    predicateleft: _this.tblmap[fk.table2][fk.column2],
                    predicateright: _this.tblmap[fk.table1][fk.column1]
                };
                _this.join.push(p);
            }
        });
    }
    DBEntityInternal.prototype.put = function (entity) {
        var _this = this;
        var entities;
        if (is.array(entity))
            entities = entity;
        else
            entities = [entity];
        // decompose entities                
        var tables = this.context.decompose(this.tableName, entities);
        // calculate pkeys
        var keys = {};
        for (var tableName in tables) {
            var dirtyRecords = tables[tableName];
            if (dirtyRecords.length > 0) {
                keys[tableName] = this.put_calculateKeys(dirtyRecords, tableName);
            }
        }
        // calculate fkeys
        for (var i = 0; i < entities.length; i++) {
            this.put_calculateForeignKeys(this.tableName, entities[i]);
        }
        // put rows - get queries
        var q = [];
        for (var i = 0; i < this.tables.length; i++) {
            var tableName = this.tables[i];
            var dirtyRecords = tables[tableName];
            if (dirtyRecords.length > 0) {
                q.push(this.put_execute(dirtyRecords, tableName, this.context.db, keys));
            }
        }
        // execute / attach
        return this.context.execMany(q).then(function (r) {
            // return just the ids for the root entitiy
            var ids = entities.map(function (value, index, array) {
                return value[_this.pk];
            });
            if (ids.length === 1)
                return ids[0];
            else
                return ids;
        }, function (e) {
            for (var tableName in tables) {
                var rollback = keys[tableName];
                if (rollback) {
                    if (rollback.dbtsIndex)
                        _this.context.rollbackKeys('dbtimestamp', rollback.dbtsIndex);
                    _this.context.rollbackKeys(tableName, rollback.index);
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
    };
    DBEntityInternal.prototype.put_calculateForeignKeys = function (table, entity, parent, parentTable) {
        for (var prop in entity) {
            var nav = this.context.dbInstance.nav[table][prop];
            if (nav !== undefined) {
                var fkColumns = this.context.dbInstance.fk[nav.tableName];
                var parentFkColumns = this.context.dbInstance.fk[table];
                var value = entity[prop];
                parent = entity;
                if (is.array(value)) {
                    for (var i = 0; i < value.length; i++) {
                        calculateForeignKeys(value[i], entity, fkColumns, parentFkColumns, nav.tableName, table);
                        this.put_calculateForeignKeys(nav.tableName, value[i], parent, table);
                    }
                }
                else if (is.object(value)) {
                    calculateForeignKeys(value, entity, fkColumns, parentFkColumns, nav.tableName, table);
                    this.put_calculateForeignKeys(nav.tableName, value, parent, table);
                }
            }
        }
        function calculateForeignKeys(entity, parent, fkColumns, parentFkColumns, table, parentTable) {
            for (var column in parentFkColumns) {
                var fkInfo = parentFkColumns[column];
                if (fkInfo.fkTable === table) {
                    parent[column] = entity[fkInfo.fkColumn];
                }
            }
            for (var column in fkColumns) {
                var fkInfo = fkColumns[column];
                if (fkInfo.fkTable === parentTable) {
                    entity[column] = parent[fkInfo.fkColumn];
                }
            }
        }
    };
    DBEntityInternal.prototype.put_calculateKeys = function (dirtyRecords, tableName) {
        var pk = this.context.dbInstance.pk[tableName];
        // select all of the rows without a key
        var missingKey = [];
        for (var i = 0; i < dirtyRecords.length; i++) {
            if (dirtyRecords[i][pk] === undefined)
                missingKey.push(i);
        }
        // allocate keys
        var idIndex = this.context.allocateKeys(tableName, missingKey.length);
        // insert keys
        for (var i = 0; i < missingKey.length; i++) {
            dirtyRecords[missingKey[i]][pk] = idIndex + i;
        }
        // add dbTimestamp (optional)
        var dbTimeStampColumn = this.context.dbInstance.options[tableName].dbtimestamp;
        var dbTimeStampIndex;
        if (dbTimeStampColumn) {
            dbTimeStampIndex = this.context.allocateKeys('dbtimestamp', dirtyRecords.length);
            for (var i = 0; i < dirtyRecords.length; i++) {
                dirtyRecords[i][dbTimeStampColumn] = dbTimeStampIndex + i;
            }
        }
        // add optional isDeleted column
        var isDeletedColumn = this.context.dbInstance.options[tableName].isdeleted;
        if (isDeletedColumn) {
            for (var i = 0; i < dirtyRecords.length; i++) {
                dirtyRecords[i][isDeletedColumn] = false;
            }
        }
        return {
            index: idIndex,
            dbtsIndex: dbTimeStampIndex
        };
    };
    DBEntityInternal.prototype.put_execute = function (dirtyRecords, tableName, db, keys) {
        //return new Promise((resolve,reject)=>{
        // create rows                                
        var table = this.context.tableSchemaMap[tableName]; //db.getSchema().table(tableName);
        var columns = this.context.dbInstance.schema[tableName];
        var rows = [];
        for (var i = 0; i < dirtyRecords.length; i++) {
            var e = dirtyRecords[i];
            var row = {};
            for (var x = 0; x < columns.length; x++) {
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
    };
    DBEntityInternal.prototype.get = function (id) {
        var _this = this;
        return this._get(id).then(function (results) {
            var entities = _this.context.compose(_this.tableName, results, _this.fkmap);
            if (is.array(id) || is.undefined(id))
                return entities;
            else
                return entities[0];
        });
    };
    DBEntityInternal.prototype._get = function (id, forcePurge) {
        var db = this.context.db;
        var table = this.context.tableSchemaMap[this.tableName]; //db.getSchema().table(this.tableName); 
        var query = this._query(db, table);
        var pk = this.context.dbInstance.pk[this.tableName];
        var dk = this.context.dbInstance.options[this.tableName]['isdeleted'];
        if (dk === undefined) {
            if (is.array(id))
                query.where(table[pk].in(id));
            else if (is.number(id))
                query.where(table[pk].eq(id));
        }
        else {
            if (is.array(id))
                query.where(lf.op.and(table[pk].in(id), table[dk].eq(false)));
            else if (is.number(id))
                query.where(lf.op.and(table[pk].eq(id), table[dk].eq(false)));
            else if (is.undefined(id) && !forcePurge)
                query.where(table[dk].eq(false));
        }
        return this.context.exec(query); //query.exec();
    };
    DBEntityInternal.prototype.query = function (context) {
        var db = this.context.db;
        var table = this.context.tableSchemaMap[this.tableName];
        var query = this._query(db, table);
        return context(this.tblmap, new QueryService(query, this.context, this.tableName, this.fkmap, this.tblmap));
    };
    DBEntityInternal.prototype.count = function (context) {
        var db = this.context.db;
        var table = this.context.tableSchemaMap[this.tableName];
        var pk = this.context.dbInstance.pk[this.tableName];
        var query = this._query(db, table, [lf.fn.count(table[pk])]);
        return context(this.tblmap, new CountService(query, this.context, this.tableName, this.fkmap, this.tblmap));
    };
    DBEntityInternal.prototype.select = function (context) {
        var db = this.context.db;
        var table = this.context.tableSchemaMap[this.tableName];
        var query = this._query(db, table, undefined, false);
        return context(this.tblmap[this.tableName], new SelectService(query, this.context, this.tableName, this.fkmap, this.tblmap));
    };
    // used by both get and query
    DBEntityInternal.prototype._query = function (db, table, columns, joinNavTables) {
        if (joinNavTables === undefined)
            joinNavTables = true;
        // execute query            
        var query = columns ? db.select.apply(db, columns).from(table) : db.select().from(table);
        if (joinNavTables) {
            for (var i = 0; i < this.join.length; i++) {
                query.innerJoin(this.join[i].table, this.join[i].predicateleft.eq(this.join[i].predicateright));
            }
        }
        return query;
    };
    //public purge(): Promise<any> {
    //    return this.delete(undefined, true);
    //}
    DBEntityInternal.prototype.delete = function (id, forcePurge) {
        var _this = this;
        return this._get(id, forcePurge).then(function (results) {
            // distinct  - flatten and remove duplicates resulting for joins
            var map = {};
            var keys = {};
            for (var i = 0; i < results.length; i++) {
                var result = results[i];
                for (var table in result) {
                    var pk = _this.context.dbInstance.pk[table];
                    var row = result[table];
                    var key = row[pk];
                    if (keys[table] === undefined) {
                        keys[table] = [key];
                        map[table] = [row];
                    }
                    else {
                        if (keys[table].indexOf(key) === -1) {
                            keys[table].push(key);
                            map[table].push(row);
                        }
                    }
                }
            }
            // delete or flag depending on settings
            var db = _this.context.db;
            var qq = [];
            for (var tableName in map) {
                var pk = _this.context.dbInstance.pk[tableName];
                var table = _this.tblmap[tableName];
                var keyList = keys[tableName];
                var dk = _this.context.dbInstance.options[tableName]['isdeleted'];
                if (dk === undefined || forcePurge === true) {
                    var q = db.delete().from(table).where(table[pk].in(keyList));
                    qq.push(q);
                }
                else {
                    var q = db.update(table).set(table[dk], true).where(table[pk].in(keyList));
                    qq.push(q);
                }
            }
            return _this.context.execMany(qq);
            //return Promise.all(promises);    
        });
    };
    return DBEntityInternal;
})();
var QueryServiceBase = (function () {
    function QueryServiceBase() {
    }
    //where(predicate: Predicate): Select
    QueryServiceBase.prototype.where = function (predicate) {
        var table = this.tblmap[this.tableName];
        var dk = this.context.dbInstance.options[this.tableName]['isdeleted'];
        if (dk === undefined) {
            this.query.where(predicate);
        }
        else {
            this.query.where(lf.op.and(predicate, table[dk].eq(false)));
        }
        return this;
    };
    //bind(...values: any[]): Builder
    //explain(): string
    QueryServiceBase.prototype.explain = function () {
        return this.query.explain();
    };
    //toSql(): string
    QueryServiceBase.prototype.toSql = function () {
        return this.query.toSql();
    };
    return QueryServiceBase;
})();
var CountService = (function (_super) {
    __extends(CountService, _super);
    function CountService(query, context, tableName, fkmap, tblmap) {
        _super.call(this);
        this.query = query;
        this.context = context;
        this.tableName = tableName;
        this.fkmap = fkmap;
        this.tblmap = tblmap;
    }
    CountService.prototype.where = function (predicate) {
        _super.prototype.where.call(this, predicate);
        return this;
    };
    CountService.prototype.exec = function () {
        var _this = this;
        var pk = this.context.dbInstance.pk[this.tableName];
        return this.context.exec(this.query).then(function (results) {
            var count = results[0][_this.tableName][("COUNT(" + pk + ")")];
            return count;
        });
    };
    return CountService;
})(QueryServiceBase);
var QueryService = (function (_super) {
    __extends(QueryService, _super);
    function QueryService(query, context, tableName, fkmap, tblmap) {
        _super.call(this);
        this.query = query;
        this.context = context;
        this.tableName = tableName;
        this.fkmap = fkmap;
        this.tblmap = tblmap;
    }
    //groupBy(...columns: schema.Column[]): Select
    QueryService.prototype.groupBy = function () {
        var columns = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            columns[_i - 0] = arguments[_i];
        }
        this.query.groupBy.apply(this, columns);
        return this;
    };
    //limit(numberOfRows: Binder|number): Select
    QueryService.prototype.limit = function (numberOfRows) {
        this.query.limit(numberOfRows);
        return this;
    };
    //orderBy(column: schema.Column, order?: Order): Select
    QueryService.prototype.orderBy = function (column, order) {
        this.query.orderBy(column, order);
        return this;
    };
    //skip(numberOfRows: Binder|number): Select
    QueryService.prototype.skip = function (numberOfRows) {
        this.query.skip(numberOfRows);
        return this;
    };
    QueryService.prototype.where = function (predicate) {
        _super.prototype.where.call(this, predicate);
        return this;
    };
    //exec(): Promise<Array<Object>>
    QueryService.prototype.exec = function () {
        var _this = this;
        //return this.query.exec().then((results)=>{
        return this.context.exec(this.query).then(function (results) {
            var entities = _this.context.compose(_this.tableName, results, _this.fkmap);
            return entities;
        });
    };
    return QueryService;
})(QueryServiceBase);
var SelectService = (function (_super) {
    __extends(SelectService, _super);
    function SelectService(query, context, tableName, fkmap, tblmap) {
        _super.call(this);
        this.query = query;
        this.context = context;
        this.tableName = tableName;
        this.fkmap = fkmap;
        this.tblmap = tblmap;
    }
    //groupBy(...columns: schema.Column[]): Select
    SelectService.prototype.groupBy = function () {
        var columns = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            columns[_i - 0] = arguments[_i];
        }
        this.query.groupBy.apply(this, columns);
        return this;
    };
    //limit(numberOfRows: Binder|number): Select
    SelectService.prototype.limit = function (numberOfRows) {
        this.query.limit(numberOfRows);
        return this;
    };
    //orderBy(column: schema.Column, order?: Order): Select
    SelectService.prototype.orderBy = function (column, order) {
        this.query.orderBy(column, order);
        return this;
    };
    //skip(numberOfRows: Binder|number): Select
    SelectService.prototype.skip = function (numberOfRows) {
        this.query.skip(numberOfRows);
        return this;
    };
    SelectService.prototype.where = function (predicate) {
        _super.prototype.where.call(this, predicate);
        return this;
    };
    //exec(): Promise<Array<Object>>
    SelectService.prototype.exec = function () {
        //return this.query.exec().then((results)=>{
        return this.context.exec(this.query).then(function (results) {
            return results;
        });
    };
    return SelectService;
})(QueryServiceBase);
// general purpos helpers
var is = (function () {
    function is() {
    }
    is.array = function (x) {
        return Array.isArray(x);
    };
    is.number = function (x) {
        return (typeof (x) === 'number');
    };
    is.string = function (x) {
        return (typeof (x) === 'string');
    };
    is.object = function (x) {
        return (typeof (x) === 'object');
    };
    is.undefined = function (x) {
        return x === undefined;
    };
    return is;
})();
exports.is = is;
var StringUtils = (function () {
    function StringUtils() {
    }
    StringUtils.removeWhiteSpace = function (str) {
        return str.replace(/\s/g, "");
    };
    return StringUtils;
})();
exports.StringUtils = StringUtils;
var PromiseUtils = (function () {
    function PromiseUtils() {
    }
    // execute functions returning promises sequentially
    PromiseUtils.serial = function () {
        var items = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            items[_i - 0] = arguments[_i];
        }
        if (items.length === 1)
            items = items[0];
        items.reverse(); // reverse so that pops come off of the bottom instead of the top.    
        return new Promise(function (resolve, reject) {
            _sequence(items, resolve, reject);
        });
        function _sequence(items, resolve, reject) {
            var d = items.pop();
            if (d) {
                var fn = d.splice(0, 1)[0];
                var args = d;
                fn.apply(this, args).then(function () { _sequence(items, resolve, reject); });
            }
            else {
                resolve();
            }
        }
    };
    return PromiseUtils;
})();
exports.PromiseUtils = PromiseUtils;
var Load = (function () {
    function Load() {
    }
    Load.json = function (url, async, cache) {
        if (cache) {
            var cachedResponse = this.cache[url];
            if (cachedResponse) {
                if (async) {
                    return new Promise(function (resolve, reject) {
                        resolve(JSON.parse(cachedResponse));
                    });
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
                    if (xmlhttp.status == 200) {
                        if (cache)
                            this.cache[url] = xmlhttp.responseText;
                        return new Promise(function (resolve, reject) {
                            resolve(JSON.parse(cachedResponse));
                        });
                    }
                    else {
                        return new Promise(function (resolve, reject) {
                            reject(xmlhttp.status);
                        });
                    }
                }
            }
        };
        xmlhttp.open("GET", url, async);
        xmlhttp.send();
        if (!async) {
            if (xmlhttp.status == 200) {
                if (cache)
                    this.cache[url] = xmlhttp.responseText;
                return JSON.parse(xmlhttp.responseText);
            }
            else {
                return xmlhttp.status;
            }
        }
    };
    Load.cache = {};
    return Load;
})();
exports.Load = Load;

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImVmLnRzIl0sIm5hbWVzIjpbIkRCU2NoZW1hIiwiREJTY2hlbWEuY29uc3RydWN0b3IiLCJEQlNjaGVtYS5jcmVhdGUiLCJEQlNjaGVtYUludGVybmFsIiwiREJTY2hlbWFJbnRlcm5hbC5jb25zdHJ1Y3RvciIsIkRCSW5zdGFuY2UiLCJEQkluc3RhbmNlLmNvbnN0cnVjdG9yIiwiREJJbnN0YW5jZS5uZXdUYWJsZU1hcCIsIkRCQ29udGV4dCIsIkRCQ29udGV4dC5jb25zdHJ1Y3RvciIsIkRCQ29udGV4dC5wdXJnZSIsIkRCQ29udGV4dC50cmFuc2FjdGlvbiIsIkRCQ29udGV4dC50YWJsZXMiLCJEQkNvbnRleHQuc2VsZWN0IiwiREJDb250ZXh0LmdldENoZWNrcG9pbnQiLCJEQkNvbnRleHQuREJFbnRpdHkiLCJEQkNvbnRleHRJbnRlcm5hbCIsIkRCQ29udGV4dEludGVybmFsLmNvbnN0cnVjdG9yIiwiREJDb250ZXh0SW50ZXJuYWwuY29tcG9zZSIsIkRCQ29udGV4dEludGVybmFsLmNvbXBvc2VfIiwiREJDb250ZXh0SW50ZXJuYWwuZGVjb21wb3NlIiwiREJDb250ZXh0SW50ZXJuYWwuZGVjb21wb3NlXyIsIkRCQ29udGV4dEludGVybmFsLmFsbG9jYXRlS2V5cyIsIkRCQ29udGV4dEludGVybmFsLnJvbGxiYWNrS2V5cyIsIkRCQ29udGV4dEludGVybmFsLnB1cmdlS2V5cyIsIkRCQ29udGV4dEludGVybmFsLmV4ZWMiLCJEQkNvbnRleHRJbnRlcm5hbC5leGVjTWFueSIsIkRCQ29udGV4dEludGVybmFsLl9leGVjTWFueSIsIkRCRW50aXR5SW50ZXJuYWwiLCJEQkVudGl0eUludGVybmFsLmNvbnN0cnVjdG9yIiwiREJFbnRpdHlJbnRlcm5hbC5wdXQiLCJEQkVudGl0eUludGVybmFsLnB1dF9jYWxjdWxhdGVGb3JlaWduS2V5cyIsIkRCRW50aXR5SW50ZXJuYWwucHV0X2NhbGN1bGF0ZUZvcmVpZ25LZXlzLmNhbGN1bGF0ZUZvcmVpZ25LZXlzIiwiREJFbnRpdHlJbnRlcm5hbC5wdXRfY2FsY3VsYXRlS2V5cyIsIkRCRW50aXR5SW50ZXJuYWwucHV0X2V4ZWN1dGUiLCJEQkVudGl0eUludGVybmFsLmdldCIsIkRCRW50aXR5SW50ZXJuYWwuX2dldCIsIkRCRW50aXR5SW50ZXJuYWwucXVlcnkiLCJEQkVudGl0eUludGVybmFsLmNvdW50IiwiREJFbnRpdHlJbnRlcm5hbC5zZWxlY3QiLCJEQkVudGl0eUludGVybmFsLl9xdWVyeSIsIkRCRW50aXR5SW50ZXJuYWwuZGVsZXRlIiwiUXVlcnlTZXJ2aWNlQmFzZSIsIlF1ZXJ5U2VydmljZUJhc2UuY29uc3RydWN0b3IiLCJRdWVyeVNlcnZpY2VCYXNlLndoZXJlIiwiUXVlcnlTZXJ2aWNlQmFzZS5leHBsYWluIiwiUXVlcnlTZXJ2aWNlQmFzZS50b1NxbCIsIkNvdW50U2VydmljZSIsIkNvdW50U2VydmljZS5jb25zdHJ1Y3RvciIsIkNvdW50U2VydmljZS53aGVyZSIsIkNvdW50U2VydmljZS5leGVjIiwiUXVlcnlTZXJ2aWNlIiwiUXVlcnlTZXJ2aWNlLmNvbnN0cnVjdG9yIiwiUXVlcnlTZXJ2aWNlLmdyb3VwQnkiLCJRdWVyeVNlcnZpY2UubGltaXQiLCJRdWVyeVNlcnZpY2Uub3JkZXJCeSIsIlF1ZXJ5U2VydmljZS5za2lwIiwiUXVlcnlTZXJ2aWNlLndoZXJlIiwiUXVlcnlTZXJ2aWNlLmV4ZWMiLCJTZWxlY3RTZXJ2aWNlIiwiU2VsZWN0U2VydmljZS5jb25zdHJ1Y3RvciIsIlNlbGVjdFNlcnZpY2UuZ3JvdXBCeSIsIlNlbGVjdFNlcnZpY2UubGltaXQiLCJTZWxlY3RTZXJ2aWNlLm9yZGVyQnkiLCJTZWxlY3RTZXJ2aWNlLnNraXAiLCJTZWxlY3RTZXJ2aWNlLndoZXJlIiwiU2VsZWN0U2VydmljZS5leGVjIiwiaXMiLCJpcy5jb25zdHJ1Y3RvciIsImlzLmFycmF5IiwiaXMubnVtYmVyIiwiaXMuc3RyaW5nIiwiaXMub2JqZWN0IiwiaXMudW5kZWZpbmVkIiwiU3RyaW5nVXRpbHMiLCJTdHJpbmdVdGlscy5jb25zdHJ1Y3RvciIsIlN0cmluZ1V0aWxzLnJlbW92ZVdoaXRlU3BhY2UiLCJQcm9taXNlVXRpbHMiLCJQcm9taXNlVXRpbHMuY29uc3RydWN0b3IiLCJQcm9taXNlVXRpbHMuc2VyaWFsIiwiUHJvbWlzZVV0aWxzLnNlcmlhbC5fc2VxdWVuY2UiLCJMb2FkIiwiTG9hZC5jb25zdHJ1Y3RvciIsIkxvYWQuanNvbiJdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7K0VBSStFOzs7Ozs7QUFFL0UsNENBQTRDO0FBQzVDLFFBQU8sa0JBQWtCLENBQUMsQ0FBQTtBQWlDMUI7SUFBQUE7SUFxSkFDLENBQUNBO0lBbEppQkQsZUFBTUEsR0FBcEJBO1FBQXNCRSxjQUFjQTthQUFkQSxXQUFjQSxDQUFkQSxzQkFBY0EsQ0FBZEEsSUFBY0E7WUFBZEEsNkJBQWNBOztRQUNoQ0EsSUFBSUEsTUFBYUEsRUFDYkEsU0FBZ0JBLEVBQ2hCQSxNQUFjQSxDQUFDQTtRQUVuQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQUEsQ0FBQ0E7WUFDbkJBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2pCQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwQkEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQUE7UUFDcEJBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3pCQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM5QkEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDbkJBLFNBQVNBLEdBQUdBLElBQUlBLENB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QUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLFdBQVdBLENBQUNBLEtBQUdBLENBQUNBLENBQUNBLENBQUFBLENBQUNBO29CQUN2Q0EsRUFBRUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsRUFBRUEsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3RDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxXQUFXQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQTtnQkFDekNBLENBQUNBO2dCQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFFWEEsa0RBQWtEQTtvQkFDbERBLElBQUlBLEdBQUdBLEdBQUdBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUFBO29CQUM1QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQUEsQ0FBQ0E7d0JBQzdCQSxJQUFJQSxNQUFNQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDNUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO29CQUN6QkEsQ0FBQ0E7b0JBQ0RBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO3dCQUMzQkEsU0FBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7b0JBQzNCQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDaENBLENBQUNBO1lBRUxBLENBQUNBO1lBQ0RBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtB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Q0FBQ0EsSUFBSUEsSUFBSUEsTUFBTUEsQ0FBQ0EsQ0FBQUEsQ0FBQ0E7WUFDckJBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQzNDQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxLQUFLQSxTQUFTQSxDQUFDQSxDQUFBQSxDQUFDQTtnQkFDbkJBLElBQUlBLEtBQUtBLEdBQUdBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUN6QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQUEsQ0FBQ0E7b0JBQ2pCQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFDQSxDQUFDQTt3QkFDL0JBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUNsQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBQ2xEQSxDQUFDQTtnQkFDTEEsQ0FBQ0E7Z0JBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUFBLENBQUNBO29CQUN2QkEsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7b0JBQy9CQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxHQUFHQSxDQUFD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QUN2QkEsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsU0FBU0EsQ0FBQ0E7UUFDM0JBLElBQUlBLENBQUNBLG9CQUFvQkEsR0FBR0Esb0JBQW9CQSxJQUFJQSxFQUFFQSxDQUFDQTtRQUN2REEsSUFBSUEsQ0FBQ0EsR0FBR0EsR0FBR0EsT0FBT0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDN0NBLElBQUlBLENBQUNBLEVBQUVBLEdBQUdBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBLEVBQUVBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1FBQzNDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUN4QkEsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxJQUFJQSxDQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUM1REEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQTtZQUM3Q0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUMvQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFFakNBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ2hCQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFF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QSxDQUFDQSxDQUFDQTtZQUN0QkEsQ0FBQ0E7UUFDTEEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFFUEEsQ0FBQ0E7SUFFR0QsOEJBQUdBLEdBQVZBLFVBQVdBLE1BQVdBO1FBQXRCRSxpQkFnRUlBO1FBL0RHQSxJQUFJQSxRQUFtQkEsQ0FBQ0E7UUFDeEJBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1lBQUNBLFFBQVFBLEdBQUdBLE1BQU1BLENBQUNBO1FBQUNBLElBQUlBO1lBQUNBLFFBQVFBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBRWxFQSxxQ0FBcUNBO1FBQ3JDQSxJQUFJQSxNQUFNQSxHQUFFQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtRQUU3REEsa0JBQWtCQTtRQUNsQkEsSUFBSUEsSUFBSUEsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDZEEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsSUFBSUEsTUFBTUEsQ0FBQ0EsQ0FBQUEsQ0FBQ0E7WUFDMUJBLElBQUlBLFlBQVlBLEdBQUdBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1lBQ3JDQSxFQUFFQSxDQUFDQSxDQUFDQSxZQUFZQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFBQSxDQUFDQTtnQkFDekJBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsWUFBWUEsRUFBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7WUFDckVBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLGtCQUFrQkE7UUFDbEJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUNBLENBQUNBLEVBQUVBLENBQUNBLEdBQUNBLFFBQVFBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVB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QUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ25EQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxLQUFLQSxTQUFTQSxDQUFDQSxDQUFBQSxDQUFDQTtnQkFDbkJBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO2dCQUMxREEsSUFBSUEsZUFBZUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3hEQSxJQUFJQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDekJBLE1BQU1BLEdBQUdBLE1BQU1BLENBQUNBO2dCQUNoQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQUEsQ0FBQ0E7b0JBQ2pCQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFDQSxDQUFDQTt3QkFDL0JBLG9CQUFvQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBQ0EsTUFBTUEsRUFBRUEsU0FBU0EsRUFBRUEsZUFBZUEsRUFBRUEsR0FBR0EsQ0FBQ0EsU0FBU0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7d0JBQ3hGQSxJQUFJQSxDQUFDQSx3QkFBd0JBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBO29CQUMx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LEdBQVhBLFVBQVlBLEVBQU1BLEVBQUVBLFVBQW9CQTtRQUNwQ1EsSUFBSUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsRUFBRUEsQ0FBQ0E7UUFDekJBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGNBQWNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUFBLHdDQUF3Q0E7UUFDaEdBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLEVBQUVBLEVBQUNBLEtBQUtBLENBQUNBLENBQUNBO1FBQ2xDQSxJQUFJQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxFQUFFQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUNwREEsSUFBSUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7UUFDdEVBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLFNBQVNBLENBQUNBLENBQUFBLENBQUNBO1lBQ2xCQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtnQkFDYkEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbENBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLE1BQU1BLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO2dCQUNuQkEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDdENBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO2dCQUNiQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNqRUEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ25CQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNqRUEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7Z0JBQ3JDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN6Q0EsQ0FBQ0E7UUFDREEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQUEsZUFBZUE7SUFDbkRBLENBQUNBO0lBRU1SLGdDQUFLQSxHQUFaQSxVQUFjQSxPQUEyQ0E7UUFDckRTLElBQUlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEVBQUVBLENBQUNBO1FBQ3pCQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxjQUFjQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUN4REEsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsRUFBRUEsRUFBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFFbENBLE1BQU1BLENBQUNBLE9BQU9BLENBQVFBLElBQUlBLENBQUNBLE1BQU1BLEVBQzdCQSxJQUFJQSxZQUFZQSxDQUFJQSxLQUFLQSxFQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxFQUFFQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUUxRkEsQ0FBQ0E7SUFFTVQsZ0NBQUtBLEdBQVpBLFVBQWNBLE9BQTJDQTtRQUNyRFUsSUFBSUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsRUFBRUEsQ0FBQ0E7UUFDekJBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGNBQWNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1FBQ3hEQSxJQUFJQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxFQUFFQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUNwREEsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsRUFBRUEsRUFBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFNURBLE1BQU1BLENBQUNBLE9BQU9BLENBQVFBLElBQUlBLENBQUNBLE1BQU1BLEVBQzdCQSxJQUFJQSxZQUFZQSxDQUFJQSxLQUFLQSxFQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxFQUFFQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUUxRkEsQ0FBQ0E7SUFFTVYsaUNBQU1BLEdBQWJBLFVBQWVBLE9BQTJDQTtRQUN0RFcsSUFBSUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsRUFBRUEsQ0FBQ0E7UUFDekJBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGNBQWNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1FBQ3hEQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxFQUFFQSxFQUFDQSxLQUFLQSxFQUFDQSxTQUFTQSxFQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUVsREEsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBUUEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsRUFDN0NBLElBQUlBLGFBQWFBLENBQUlBLEtBQUtBLEVBQUNBLElBQUlBLENBQUNBLE9BQU9BLEVBQUVBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO0lBRTNGQSxDQUFDQTtJQUVEWCw2QkFBNkJBO0lBQ3JCQSxpQ0FBTUEsR0FBZEEsVUFBZUEsRUFBZUEsRUFBRUEsS0FBc0JBLEVBQUVBLE9BQTRCQSxFQUFFQSxhQUF1QkE7UUFFekdZLEVBQUVBLENBQUNBLENBQUNBLGFBQWFBLEtBQUdBLFNBQVNBLENBQUNBO1lBQUNBLGFBQWFBLEdBQUNBLElBQUlBLENBQUNBO1FBQ2xEQSw0QkFBNEJBO1FBQzVCQSxJQUFJQSxLQUFLQSxHQUFHQSxPQUFPQSxHQUFHQSxFQUFFQSxDQUFDQSxNQUFNQSxPQUFUQSxFQUFFQSxFQUFXQSxPQUFPQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUNsRkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQUEsQ0FBQ0E7WUFDZkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBRUEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBQ0EsQ0FBQ0E7Z0JBQ3BDQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxFQUFFQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxhQUFhQSxDQUFDQSxFQUFFQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQSxDQUFBQTtZQUNuR0EsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFDREEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7SUFFakJBLENBQUNBO0lBRURaLGdDQUFnQ0E7SUFDaENBLDBDQUEwQ0E7SUFDMUNBLEdBQUdBO0lBQ0lBLGlDQUFNQSxHQUFiQSxVQUFjQSxFQUFPQSxFQUFFQSxVQUFtQkE7UUFBMUNhLGlCQW9EQ0E7UUFsREdBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEVBQUVBLFVBQVVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFVBQUFBLE9BQU9BO1lBRXpDQSxnRUFBZ0VBO1lBQ2hFQSxJQUFJQSxHQUFHQSxHQUFHQSxFQUFFQSxDQUFDQTtZQUNiQSxJQUFJQSxJQUFJQSxHQUFHQSxFQUFFQSxDQUFDQTtZQUNkQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFDQSxDQUFDQTtnQkFDakNBLElBQUlBLE1BQU1BLEdBQUdBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUN4QkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsS0FBS0EsSUFBSUEsTUFBTUEsQ0FBQ0EsQ0FBQUEsQ0FBQ0E7b0JBQ3RCQSxJQUFJQSxFQUFFQSxHQUFHQSxLQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtvQkFDM0NBLElBQUlBLEdBQUdBLEdBQUdBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO29CQUN4QkEsSUFBSUEsR0FBR0EsR0FBR0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7b0JBRWxCQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFHQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDMUJBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUVBLEdBQUdBLENBQUVBLENBQUNBO3dCQUN0QkEsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBRUEsR0FBR0EsQ0FBRUEsQ0FBQ0E7b0JBQ3pCQSxDQUFDQTtvQkFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7d0JBQ0ZBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUFBLENBQUNBOzRCQUNqQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBRUEsR0FBR0EsQ0FBRUEsQ0FBQ0E7NEJBQ3hCQSxHQUFHQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFFQSxHQUFHQSxDQUFFQSxDQUFDQTt3QkFDM0JBLENBQUNBO29CQUNMQSxDQUFDQTtnQkFDTEEsQ0FBQ0E7WUFDTEEsQ0FBQ0E7WUFFREEsdUNBQXVDQTtZQUN2Q0EsSUFBSUEsRUFBRUEsR0FBR0EsS0FBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDekJBLElBQUlBLEVBQUVBLEdBQUdBLEVBQUVBLENBQUNBO1lBQ1pBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLElBQUlBLEdBQUdBLENBQUNBLENBQUFBLENBQUNBO2dCQUN2QkEsSUFBSUEsRUFBRUEsR0FBR0EsS0FBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7Z0JBQy9DQSxJQUFJQSxLQUFLQSxHQUFHQSxLQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtnQkFDbkNBLElBQUlBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO2dCQUU5QkEsSUFBSUEsRUFBRUEsR0FBR0EsS0FBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pFQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFJQSxTQUFTQSxJQUFJQSxVQUFVQSxLQUFJQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDeENBLElBQUlBLENBQUNBLEdBQUVBLEVBQUVBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUFBO29CQUMzREEsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBRWZBLENBQUNBO2dCQUNEQSxJQUFJQSxDQUFBQSxDQUFDQTtvQkFDREEsSUFBSUEsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQUE7b0JBQ3pFQSxFQUFFQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFFZkEsQ0FBQ0E7WUFFTEEsQ0FBQ0E7WUFFREEsTUFBTUEsQ0FBQ0EsS0FBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDakNBLG1DQUFtQ0E7UUFDdkNBLENBQUNBLENBQUNBLENBQUNBO0lBQ1BBLENBQUNBO0lBQ0xiLHVCQUFDQTtBQUFEQSxDQW5hQSxBQW1hQ0EsSUFBQTtBQUVEO0lBQUFjO0lBOEJBQyxDQUFDQTtJQXZCR0QscUNBQXFDQTtJQUM5QkEsZ0NBQUtBLEdBQVpBLFVBQWFBLFNBQXVCQTtRQUNoQ0UsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDeENBLElBQUlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBO1FBQ3RFQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxTQUFTQSxDQUFDQSxDQUFBQSxDQUFDQTtZQUNsQkEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDaENBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLEVBQUNBLEtBQUtBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQy9EQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtJQUNoQkEsQ0FBQ0E7SUFFREYsaUNBQWlDQTtJQUVqQ0EsbUJBQW1CQTtJQUNaQSxrQ0FBT0EsR0FBZEE7UUFDSUcsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsRUFBRUEsQ0FBQ0E7SUFDaENBLENBQUNBO0lBQ0RILGlCQUFpQkE7SUFDVkEsZ0NBQUtBLEdBQVpBO1FBQ0lJLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBO0lBQzlCQSxDQUFDQTtJQUNMSix1QkFBQ0E7QUFBREEsQ0E5QkEsQUE4QkNBLElBQUE7QUFDRDtJQUE4QkssZ0NBQW1CQTtJQUU3Q0Esc0JBQ2NBLEtBQXNCQSxFQUN0QkEsT0FBMEJBLEVBQzFCQSxTQUFpQkEsRUFDakJBLEtBQWFBLEVBQ2JBLE1BQWNBO1FBQ3BCQyxpQkFBT0EsQ0FBQ0E7UUFMRkEsVUFBS0EsR0FBTEEsS0FBS0EsQ0FBaUJBO1FBQ3RCQSxZQUFPQSxHQUFQQSxPQUFPQSxDQUFtQkE7UUFDMUJBLGNBQVNBLEdBQVRBLFNBQVNBLENBQVFBO1FBQ2pCQSxVQUFLQSxHQUFMQSxLQUFLQSxDQUFRQTtRQUNiQSxXQUFNQSxHQUFOQSxNQUFNQSxDQUFRQTtJQUV4QkEsQ0FBQ0E7SUFFRUQsNEJBQUtBLEdBQVpBLFVBQWFBLFNBQXVCQTtRQUNoQ0UsZ0JBQUtBLENBQUNBLEtBQUtBLFlBQUNBLFNBQVNBLENBQUNBLENBQUNBO1FBQ3ZCQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtJQUNoQkEsQ0FBQ0E7SUFDTUYsMkJBQUlBLEdBQVhBO1FBQUFHLGlCQU1DQTtRQUxHQSxJQUFJQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxFQUFFQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUNwREEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBQ0EsT0FBT0E7WUFDOUNBLElBQUlBLEtBQUtBLEdBQUdBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLFlBQVNBLEVBQUVBLE9BQUdBLENBQUNBLENBQUNBO1lBQ3ZEQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtRQUNqQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDUEEsQ0FBQ0E7SUFDTEgsbUJBQUNBO0FBQURBLENBdEJBLEFBc0JDQSxFQXRCNkIsZ0JBQWdCLEVBc0I3QztBQUNEO0lBQThCSSxnQ0FBbUJBO0lBRTdDQSxzQkFDY0EsS0FBc0JBLEVBQ3RCQSxPQUEwQkEsRUFDMUJBLFNBQWlCQSxFQUNqQkEsS0FBYUEsRUFDYkEsTUFBY0E7UUFDcEJDLGlCQUFPQSxDQUFBQTtRQUxEQSxVQUFLQSxHQUFMQSxLQUFLQSxDQUFpQkE7UUFDdEJBLFlBQU9BLEdBQVBBLE9BQU9BLENBQW1CQTtRQUMxQkEsY0FBU0EsR0FBVEEsU0FBU0EsQ0FBUUE7UUFDakJBLFVBQUtBLEdBQUxBLEtBQUtBLENBQVFBO1FBQ2JBLFdBQU1BLEdBQU5BLE1BQU1BLENBQVFBO0lBRXhCQSxDQUFDQTtJQUVMRCw4Q0FBOENBO0lBRXZDQSw4QkFBT0EsR0FBZEE7UUFBZUUsaUJBQThCQTthQUE5QkEsV0FBOEJBLENBQTlCQSxzQkFBOEJBLENBQTlCQSxJQUE4QkE7WUFBOUJBLGdDQUE4QkE7O1FBQ3pDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxFQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUN2Q0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7SUFDaEJBLENBQUNBO0lBRURGLDRDQUE0Q0E7SUFDckNBLDRCQUFLQSxHQUFaQSxVQUFhQSxZQUE4QkE7UUFDdkNHLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBO1FBQy9CQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtJQUNoQkEsQ0FBQ0E7SUFFREgsdURBQXVEQTtJQUNoREEsOEJBQU9BLEdBQWRBLFVBQWVBLE1BQXdCQSxFQUFFQSxLQUFnQkE7UUFDckRJLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBO1FBQ2xDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtJQUNoQkEsQ0FBQ0E7SUFFREosMkNBQTJDQTtJQUNwQ0EsMkJBQUlBLEdBQVhBLFVBQVlBLFlBQThCQTtRQUN0Q0ssSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0E7UUFDOUJBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO0lBQ2hCQSxDQUFDQTtJQUdNTCw0QkFBS0EsR0FBWkEsVUFBYUEsU0FBdUJBO1FBQ2hDTSxnQkFBS0EsQ0FBQ0EsS0FBS0EsWUFBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDdkJBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO0lBQ2hCQSxDQUFDQTtJQUVETixnQ0FBZ0NBO0lBQ3pCQSwyQkFBSUEsR0FBWEE7UUFBQU8saUJBTUNBO1FBTEdBLDRDQUE0Q0E7UUFDNUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFVBQUNBLE9BQU9BO1lBQzlDQSxJQUFJQSxRQUFRQSxHQUFHQSxLQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxPQUFPQSxFQUFFQSxLQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUN6RUEsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0E7UUFDcEJBLENBQUNBLENBQUNBLENBQUNBO0lBQ1BBLENBQUNBO0lBQ0xQLG1CQUFDQTtBQUFEQSxDQWxEQSxBQWtEQ0EsRUFsRDZCLGdCQUFnQixFQWtEN0M7QUFFRDtJQUErQlEsaUNBQW1CQTtJQUU5Q0EsdUJBQ2NBLEtBQXNCQSxFQUN0QkEsT0FBMEJBLEVBQzFCQSxTQUFpQkEsRUFDakJBLEtBQWFBLEVBQ2JBLE1BQWNBO1FBQ3BCQyxpQkFBT0EsQ0FBQUE7UUFMREEsVUFBS0EsR0FBTEEsS0FBS0EsQ0FBaUJBO1FBQ3RCQSxZQUFPQSxHQUFQQSxPQUFPQSxDQUFtQkE7UUFDMUJBLGNBQVNBLEdBQVRBLFNBQVNBLENBQVFBO1FBQ2pCQSxVQUFLQSxHQUFMQSxLQUFLQSxDQUFRQTtRQUNiQSxXQUFNQSxHQUFOQSxNQUFNQSxDQUFRQTtJQUV4QkEsQ0FBQ0E7SUFFTEQsOENBQThDQTtJQUV2Q0EsK0JBQU9BLEdBQWRBO1FBQWVFLGlCQUE4QkE7YUFBOUJBLFdBQThCQSxDQUE5QkEsc0JBQThCQSxDQUE5QkEsSUFBOEJBO1lBQTlCQSxnQ0FBOEJBOztRQUN6Q0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsRUFBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFDdkNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO0lBQ2hCQSxDQUFDQTtJQUVERiw0Q0FBNENBO0lBQ3JDQSw2QkFBS0EsR0FBWkEsVUFBYUEsWUFBOEJBO1FBQ3ZDRyxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQTtRQUMvQkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7SUFDaEJBLENBQUNBO0lBRURILHVEQUF1REE7SUFDaERBLCtCQUFPQSxHQUFkQSxVQUFlQSxNQUF3QkEsRUFBRUEsS0FBZ0JBO1FBQ3JESSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUNsQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7SUFDaEJBLENBQUNBO0lBRURKLDJDQUEyQ0E7SUFDcENBLDRCQUFJQSxHQUFYQSxVQUFZQSxZQUE4QkE7UUFDdENLLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBO1FBQzlCQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtJQUNoQkEsQ0FBQ0E7SUFHTUwsNkJBQUtBLEdBQVpBLFVBQWFBLFNBQXVCQTtRQUNoQ00sZ0JBQUtBLENBQUNBLEtBQUtBLFlBQUNBLFNBQVNBLENBQUNBLENBQUNBO1FBQ3ZCQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtJQUNoQkEsQ0FBQ0E7SUFFRE4sZ0NBQWdDQTtJQUN6QkEsNEJBQUlBLEdBQVhBO1FBQ0lPLDRDQUE0Q0E7UUFDNUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFVBQUNBLE9BQU9BO1lBQzlDQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQTtRQUNuQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDUEEsQ0FBQ0E7SUFDTFAsb0JBQUNBO0FBQURBLENBakRBLEFBaURDQSxFQWpEOEIsZ0JBQWdCLEVBaUQ5QztBQUVELHlCQUF5QjtBQUN6QjtJQUFBUTtJQWdCQUMsQ0FBQ0E7SUFmaUJELFFBQUtBLEdBQW5CQSxVQUFvQkEsQ0FBS0E7UUFDckJFLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO0lBQzVCQSxDQUFDQTtJQUNhRixTQUFNQSxHQUFwQkEsVUFBcUJBLENBQUtBO1FBQ3RCRyxNQUFNQSxDQUFDQSxDQUFDQSxPQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFHQSxRQUFRQSxDQUFDQSxDQUFDQTtJQUNsQ0EsQ0FBQ0E7SUFDYUgsU0FBTUEsR0FBcEJBLFVBQXFCQSxDQUFLQTtRQUN0QkksTUFBTUEsQ0FBQ0EsQ0FBQ0EsT0FBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBR0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7SUFDbENBLENBQUNBO0lBQ2FKLFNBQU1BLEdBQXBCQSxVQUFxQkEsQ0FBS0E7UUFDdEJLLE1BQU1BLENBQUNBLENBQUNBLE9BQU1BLENBQUNBLENBQUNBLENBQUNBLEtBQUdBLFFBQVFBLENBQUNBLENBQUNBO0lBQ2xDQSxDQUFDQTtJQUNhTCxZQUFTQSxHQUF2QkEsVUFBd0JBLENBQUtBO1FBQ3pCTSxNQUFNQSxDQUFDQSxDQUFDQSxLQUFLQSxTQUFTQSxDQUFDQTtJQUMzQkEsQ0FBQ0E7SUFDTE4sU0FBQ0E7QUFBREEsQ0FoQkEsQUFnQkNBLElBQUE7QUFoQlksVUFBRSxLQWdCZCxDQUFBO0FBRUQ7SUFBQU87SUFJQUMsQ0FBQ0E7SUFIaUJELDRCQUFnQkEsR0FBOUJBLFVBQStCQSxHQUFXQTtRQUN0Q0UsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7SUFDbENBLENBQUNBO0lBQ0xGLGtCQUFDQTtBQUFEQSxDQUpBLEFBSUNBLElBQUE7QUFKWSxtQkFBVyxjQUl2QixDQUFBO0FBRUQ7SUFBQUc7SUF1QkFDLENBQUNBO0lBckJHRCxvREFBb0RBO0lBQ3RDQSxtQkFBTUEsR0FBcEJBO1FBQXFCRSxlQUFpQkE7YUFBakJBLFdBQWlCQSxDQUFqQkEsc0JBQWlCQSxDQUFqQkEsSUFBaUJBO1lBQWpCQSw4QkFBaUJBOztRQUNsQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsS0FBSUEsQ0FBQ0EsQ0FBQ0E7WUFBQ0EsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDeENBLEtBQUtBLENBQUNBLE9BQU9BLEVBQUVBLENBQUNBLENBQUNBLHNFQUFzRUE7UUFFdkZBLE1BQU1BLENBQUNBLElBQUlBLE9BQU9BLENBQUNBLFVBQUNBLE9BQU9BLEVBQUNBLE1BQU1BO1lBQzlCQSxTQUFTQSxDQUFDQSxLQUFLQSxFQUFFQSxPQUFPQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUN0Q0EsQ0FBQ0EsQ0FBQ0EsQ0FBQUE7UUFFRkEsbUJBQW1CQSxLQUFjQSxFQUFFQSxPQUFPQSxFQUFFQSxNQUFNQTtZQUM5Q0MsSUFBSUEsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0E7WUFDcEJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUFBLENBQUNBO2dCQUNIQSxJQUFJQSxFQUFFQSxHQUFxQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsRUFBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzVEQSxJQUFJQSxJQUFJQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDYkEsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsRUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsY0FBTUEsU0FBU0EsQ0FBQ0EsS0FBS0EsRUFBRUEsT0FBT0EsRUFBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQUEsQ0FBQ0EsQ0FBQ0EsQ0FBQUE7WUFDdEVBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLENBQUNBO2dCQUNGQSxPQUFPQSxFQUFFQSxDQUFDQTtZQUNkQSxDQUFDQTtRQUNMQSxDQUFDQTtJQUNMRCxDQUFDQTtJQUNMRixtQkFBQ0E7QUFBREEsQ0F2QkEsQUF1QkNBLElBQUE7QUF2Qlksb0JBQVksZUF1QnhCLENBQUE7QUFFRDtJQUFBSTtJQXFEQUMsQ0FBQ0E7SUFsRGlCRCxTQUFJQSxHQUFsQkEsVUFBbUJBLEdBQVdBLEVBQUVBLEtBQWVBLEVBQUVBLEtBQWNBO1FBRTNERSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFBQSxDQUFDQTtZQUNQQSxJQUFJQSxjQUFjQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNyQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQUEsQ0FBQ0E7Z0JBQ2hCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFBQSxDQUFDQTtvQkFDUEEsTUFBTUEsQ0FBQ0EsSUFBSUEsT0FBT0EsQ0FBQ0EsVUFBQ0EsT0FBT0EsRUFBQ0EsTUFBTUE7d0JBQzlCQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDeENBLENBQUNBLENBQUNBLENBQUFBO2dCQUNOQSxDQUFDQTtnQkFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7b0JBQ0ZBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLGNBQWNBLENBQUNBLENBQUNBO2dCQUN0Q0EsQ0FBQ0E7WUFDTEEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFFREEsSUFBSUEsT0FBT0EsR0FBR0EsSUFBSUEsY0FBY0EsRUFBRUEsQ0FBQ0E7UUFDbkNBLE9BQU9BLENBQUNBLGtCQUFrQkEsR0FBR0E7WUFDekIsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLFVBQVUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUMxQixFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO29CQUNSLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLElBQUksR0FBRyxDQUFDLENBQUEsQ0FBQzt3QkFFdkIsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDOzRCQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsT0FBTyxDQUFDLFlBQVksQ0FBQzt3QkFDbEQsTUFBTSxDQUFDLElBQUksT0FBTyxDQUFDLFVBQUMsT0FBTyxFQUFDLE1BQU07NEJBQzlCLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUM7d0JBQ3hDLENBQUMsQ0FBQyxDQUFDO29CQUVQLENBQUM7b0JBQ0QsSUFBSSxDQUFDLENBQUM7d0JBQ0YsTUFBTSxDQUFDLElBQUksT0FBTyxDQUFDLFVBQUMsT0FBTyxFQUFDLE1BQU07NEJBQzlCLE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7d0JBQzNCLENBQUMsQ0FBQyxDQUFDO29CQUNQLENBQUM7Z0JBQ0wsQ0FBQztZQUNMLENBQUM7UUFDTCxDQUFDLENBQUNBO1FBR0ZBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLEVBQUVBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBO1FBQ2hDQSxPQUFPQSxDQUFDQSxJQUFJQSxFQUFFQSxDQUFDQTtRQUNmQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFBQSxDQUFDQTtZQUNSQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxJQUFJQSxHQUFHQSxDQUFDQSxDQUFBQSxDQUFDQTtnQkFDdkJBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBO29CQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQTtnQkFDbERBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLENBQUNBO1lBQzVDQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFBQSxDQUFDQTtnQkFDREEsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDMUJBLENBQUNBO1FBQ0xBLENBQUNBO0lBQ0xBLENBQUNBO0lBbkRjRixVQUFLQSxHQUFHQSxFQUFFQSxDQUFDQTtJQW9EOUJBLFdBQUNBO0FBQURBLENBckRBLEFBcURDQSxJQUFBO0FBckRZLFlBQUksT0FxRGhCLENBQUEiLCJmaWxlIjoiZWYuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbnwgQ29weXJpZ2h0IChjKSAyMDE1LCBQb3NpdGl2ZSBUZWNobm9sb2d5XHJcbnwgRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIHRlcm1zIG9mIHRoZSBNSVQgTGljZW5zZS5cclxufCBUaGUgZnVsbCBsaWNlbnNlIGlzIGluIHRoZSBmaWxlIExJQ0VOU0UsIGRpc3RyaWJ1dGVkIHdpdGggdGhpcyBzb2Z0d2FyZS5cclxufC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xyXG5cclxuLy8vIDxyZWZlcmVuY2UgcGF0aD1cIi4uL3R5cGluZ3MvdHNkLmQudHNcIiAvPlxyXG5pbXBvcnQgJ2dvb2dsZS9sb3ZlZmllbGQnO1xyXG5cclxuLy8gZXhwb3J0c1xyXG5leHBvcnQgaW50ZXJmYWNlIERCRW50aXR5PFQsIEVfQ1RYLCBUX0NUWD4ge1xyXG4gICAgcHV0KGVudGl0eTogVCk6IFByb21pc2U8bnVtYmVyPjtcclxuICAgIHB1dChlbnRpdGllczogVFtdKTogUHJvbWlzZTxudW1iZXJbXT47XHJcbiAgICBnZXQoaWQ6IG51bWJlcik6IFByb21pc2U8VD47XHJcbiAgICBnZXQoaWQ/OiBudW1iZXJbXSk6IFByb21pc2U8VFtdPjtcclxuICAgIGRlbGV0ZShpZDogbnVtYmVyKTogUHJvbWlzZTxUPjtcclxuICAgIGRlbGV0ZShpZD86IG51bWJlcltdKTogUHJvbWlzZTxUW10+O1xyXG4gICAgcXVlcnkoIGZuOiAoY29udGV4dDpFX0NUWCwgcXVlcnk6REJRdWVyeTxUPik9PmFueSk6IFByb21pc2U8VFtdPjtcclxuICAgIGNvdW50KCBmbjogKGNvbnRleHQ6RV9DVFgsIHF1ZXJ5OkRCQ291bnQ8VD4pPT5hbnkpOiBQcm9taXNlPG51bWJlcj47XHJcbiAgICBzZWxlY3QoIGZuOiAoY29udGV4dDpUX0NUWCwgcXVlcnk6REJRdWVyeTxUPik9PmFueSk6IFByb21pc2U8VFtdPjtcclxufVxyXG5leHBvcnQgaW50ZXJmYWNlIERCUXVlcnk8VD4ge1xyXG4gICAgZ3JvdXBCeSguLi5jb2x1bW5zOiBsZi5zY2hlbWEuQ29sdW1uW10pOiBEQlF1ZXJ5PFQ+XHJcbiAgICBsaW1pdChudW1iZXJPZlJvd3M6IGxmLkJpbmRlcnxudW1iZXIpOiBEQlF1ZXJ5PFQ+XHJcbiAgICBvcmRlckJ5KGNvbHVtbjogbGYuc2NoZW1hLkNvbHVtbiwgb3JkZXI/OiBsZi5PcmRlcik6IERCUXVlcnk8VD5cclxuICAgIHNraXAobnVtYmVyT2ZSb3dzOiBsZi5CaW5kZXJ8bnVtYmVyKTogREJRdWVyeTxUPlxyXG4gICAgd2hlcmUocHJlZGljYXRlOiBsZi5QcmVkaWNhdGUpOiBEQlF1ZXJ5PFQ+XHJcbiAgICBleHBsYWluKCk6c3RyaW5nXHJcbiAgICB0b1NxbCgpOnN0cmluZ1xyXG4gICAgZXhlYygpIDogUHJvbWlzZTxUW10+XHJcbn1cclxuZXhwb3J0IGludGVyZmFjZSBEQkNvdW50PFQ+IHtcclxuICAgIHdoZXJlKHByZWRpY2F0ZTogbGYuUHJlZGljYXRlKTogREJDb3VudDxUPlxyXG4gICAgZXhwbGFpbigpOnN0cmluZ1xyXG4gICAgdG9TcWwoKTpzdHJpbmdcclxuICAgIGV4ZWMoKTpudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBEQk1vZGVsIHt9XHJcblxyXG5leHBvcnQgY2xhc3MgREJTY2hlbWEge1xyXG4gICAgcHVibGljIHN0YXRpYyBjcmVhdGUgKGRiTmFtZTogc3RyaW5nLCBkYlZlcnNpb246IG51bWJlciwgc2NoZW1hOiBPYmplY3QpOiB2b2lkO1xyXG4gICAgcHVibGljIHN0YXRpYyBjcmVhdGUgKGpzb25GaWxlUGF0aDpzdHJpbmcpOiB2b2lkOyAgICAgXHJcbiAgICBwdWJsaWMgc3RhdGljIGNyZWF0ZSAoLi4uYXJnczogYW55W10pOiB2b2lkIHsgICAgICAgXHJcbiAgICAgICAgdmFyIGRiTmFtZTpzdHJpbmcsIFxyXG4gICAgICAgICAgICBkYlZlcnNpb246bnVtYmVyLCBcclxuICAgICAgICAgICAgc2NoZW1hOiBPYmplY3Q7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIGlmIChhcmdzLmxlbmd0aCA9PT0gMyl7XHJcbiAgICAgICAgICAgIGRiTmFtZSA9IGFyZ3NbMF07XHJcbiAgICAgICAgICAgIGRiVmVyc2lvbiA9IGFyZ3NbMV07XHJcbiAgICAgICAgICAgIHNjaGVtYSA9IGFyZ3NbMl1cclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSBpZiAoYXJncy5sZW5ndGggPT09IDEpIHtcclxuICAgICAgICAgICAgdmFyIGRhdGEgPSBMb2FkLmpzb24oYXJnc1swXSk7XHJcbiAgICAgICAgICAgIGRiTmFtZSA9IGRhdGEubmFtZTtcclxuICAgICAgICAgICAgZGJWZXJzaW9uID0gZGF0YS52ZXJzaW9uO1xyXG4gICAgICAgICAgICBzY2hlbWEgPSBkYXRhLnNjaGVtYTtcclxuICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICB2YXIgc2NoZW1hQnVpbGRlciA9IGxmLnNjaGVtYS5jcmVhdGUoZGJOYW1lLCBkYlZlcnNpb24pOyAgICAgICAgXHJcbiAgICAgICAgdmFyIGNvbHVtbnM6YW55ID0ge307XHJcbiAgICAgICAgdmFyIG5hdjphbnkgPSB7fTtcclxuICAgICAgICB2YXIgZms6YW55ID0ge307XHJcbiAgICAgICAgdmFyIHBrOmFueSA9IHt9O1xyXG4gICAgICAgIHZhciB0YWJsZXM6c3RyaW5nW10gPSBbXTtcclxuICAgICAgICB2YXIgb3B0aW9uczphbnkgPSB7fTtcclxuICAgICAgICBcclxuICAgICAgICBmb3IgKHZhciB0YWJsZSBpbiBzY2hlbWEpe1xyXG4gICAgICAgICAgICB2YXIgdGFibGVTY2hlbWEgPSBzY2hlbWFbdGFibGVdO1xyXG4gICAgICAgICAgICB2YXIgdGIgPXNjaGVtYUJ1aWxkZXIuY3JlYXRlVGFibGUodGFibGUpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdGFibGVzLnB1c2godGFibGUpOyAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgbnVsbGFibGVzID0gW107XHJcbiAgICAgICAgICAgIHZhciBpbmRlY2VzID0gW107XHJcbiAgICAgICAgICAgIGNvbHVtbnNbdGFibGVdID0gW107XHJcbiAgICAgICAgICAgIG5hdlt0YWJsZV0gPSB7fTtcclxuICAgICAgICAgICAgZmtbdGFibGVdID0ge30gICAgICAgICAgIFxyXG4gICAgICAgICAgICBvcHRpb25zW3RhYmxlXSA9IHt9O1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIHBrZXlzIDogc3RyaW5nW10gPSBbXTtcclxuICAgICAgICAgICAgZm9yICh2YXIgY29sdW1uIGluIHRhYmxlU2NoZW1hKXtcclxuICAgICAgICAgICAgICAgIHZhciB0eXBlRGVmID0gU3RyaW5nVXRpbHMucmVtb3ZlV2hpdGVTcGFjZSh0YWJsZVNjaGVtYVtjb2x1bW5dKTtcclxuICAgICAgICAgICAgICAgIHZhciBpc0NvbHVtbiA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICB2YXIgaXNQa2V5ID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmICh0eXBlRGVmLmluZGV4T2YoJ3BrZXknKT09PTApe1xyXG4gICAgICAgICAgICAgICAgICAgIHRiLmFkZENvbHVtbihjb2x1bW4sIGxmLlR5cGUuSU5URUdFUilcclxuICAgICAgICAgICAgICAgICAgICBpc1BrZXk9dHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICBwa2V5cy5wdXNoKGNvbHVtbilcclxuICAgICAgICAgICAgICAgICAgICBwa1t0YWJsZV0gPSBjb2x1bW47XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBlbHNlIGlmICh0eXBlRGVmLmluZGV4T2YoJ3N0cmluZycpID09PSAwKXtcclxuICAgICAgICAgICAgICAgICAgICB0Yi5hZGRDb2x1bW4oY29sdW1uLCBsZi5UeXBlLlNUUklORylcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKHR5cGVEZWYuaW5kZXhPZignZGF0ZScpPT09MCl7XHJcbiAgICAgICAgICAgICAgICAgICAgdGIuYWRkQ29sdW1uKGNvbHVtbiwgbGYuVHlwZS5EQVRFX1RJTUUpXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBlbHNlIGlmICh0eXBlRGVmLmluZGV4T2YoJ2Jvb2xlYW4nKT09PTApe1xyXG4gICAgICAgICAgICAgICAgICAgIHRiLmFkZENvbHVtbihjb2x1bW4sIGxmLlR5cGUuQk9PTEVBTilcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKHR5cGVEZWYuaW5kZXhPZignaW50Jyk9PT0wKXtcclxuICAgICAgICAgICAgICAgICAgICB0Yi5hZGRDb2x1bW4oY29sdW1uLCBsZi5UeXBlLklOVEVHRVIpXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBlbHNlIGlmICh0eXBlRGVmLmluZGV4T2YoJ2Zsb2F0Jyk9PT0wKXtcclxuICAgICAgICAgICAgICAgICAgICB0Yi5hZGRDb2x1bW4oY29sdW1uLCBsZi5UeXBlLk5VTUJFUilcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKHR5cGVEZWYuaW5kZXhPZignb2JqZWN0Jyk9PT0wKXtcclxuICAgICAgICAgICAgICAgICAgICB0Yi5hZGRDb2x1bW4oY29sdW1uLCBsZi5UeXBlLk9CSkVDVClcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKHR5cGVEZWYuaW5kZXhPZignYXJyYXknKT09PTApe1xyXG4gICAgICAgICAgICAgICAgICAgIHRiLmFkZENvbHVtbihjb2x1bW4sIGxmLlR5cGUuQVJSQVlfQlVGRkVSKVxyXG4gICAgICAgICAgICAgICAgfSAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKHR5cGVEZWYuaW5kZXhPZignZmtleScpPT09MCl7XHJcbiAgICAgICAgICAgICAgICAgICAgdGIuYWRkQ29sdW1uKGNvbHVtbiwgbGYuVHlwZS5JTlRFR0VSKSAgICBcclxuICAgICAgICAgICAgICAgICAgICBudWxsYWJsZXMucHVzaChjb2x1bW4pOyAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIHZhciB4ID10eXBlRGVmLnNwbGl0KCc6JylbMV0uc3BsaXQoJy4nKTtcclxuICAgICAgICAgICAgICAgICAgICBma1t0YWJsZV1bY29sdW1uXSA9IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29sdW1uTmFtZTogY29sdW1uLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBma1RhYmxlOiB4WzBdLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBma0NvbHVtbjogeFsxXVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAvKiBma2V5cyBjdXJyZW50bHkgZGlzYWJsZWQgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJlY2F1c2UgYSBidWcgaW4gZW50aXR5LnB1dCgpIGV4ZWN1dGVzIHF1ZXJpZXNcclxuICAgICAgICAgICAgICAgICAgICAgICAgaW4gcGFyYWxlbGwgaW5zdGVhZCBvZiBpbiBzZXJpZXMuXHJcbiAgICAgICAgICAgICAgICAgICAgKi9cclxuICAgICAgICAgICAgICAgICAgICAvKlxyXG4gICAgICAgICAgICAgICAgICAgIHRiLmFkZEZvcmVpZ25LZXkoYGZrXyR7Y29sdW1ufWAsIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbG9jYWw6IGNvbHVtbixcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmVmOiBgJHt4WzBdfS4ke3hbMV19YCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgYWN0aW9uOiBsZi5Db25zdHJhaW50QWN0aW9uLlJFU1RSSUNULFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aW1pbmc6IGxmLkNvbnN0cmFpbnRUaW1pbmcuREVGRVJSQUJMRVxyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgICovXHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBlbHNlIGlmICh0eXBlRGVmLmluZGV4T2YoJ25hdi0+Jyk9PTApe1xyXG4gICAgICAgICAgICAgICAgICAgIGlzQ29sdW1uID0gZmFsc2U7ICBcclxuICAgICAgICAgICAgICAgICAgICB2YXIgeD10eXBlRGVmLnNwbGl0KCc+JylbMV0uc3BsaXQoJzonKTtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgeT14WzFdLnNwbGl0KCcuJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIHRhYmxlTmFtZT14WzBdO1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBma1RhYmxlPXlbMF07XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIGZrQ29sdW1uPXlbMV07XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgbmF2W3RhYmxlXVtjb2x1bW5dID0ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgIGNvbHVtbk5hbWU6IGNvbHVtbixcclxuICAgICAgICAgICAgICAgICAgICAgICB0YWJsZU5hbWU6IHRhYmxlTmFtZSxcclxuICAgICAgICAgICAgICAgICAgICAgICBma1RhYmxlOiBma1RhYmxlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgIGZrQ29sdW1uOiBma0NvbHVtbixcclxuICAgICAgICAgICAgICAgICAgICAgICBpc0FycmF5OiAoZmtUYWJsZSA9PT0gdGFibGVOYW1lKVxyXG4gICAgICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBlbHNlIGlmICh0eXBlRGVmLmluZGV4T2YoJ2RidGltZXN0YW1wJyk9PT0wKXtcclxuICAgICAgICAgICAgICAgICAgICB0Yi5hZGRDb2x1bW4oY29sdW1uLCBsZi5UeXBlLklOVEVHRVIpXHJcbiAgICAgICAgICAgICAgICAgICAgb3B0aW9uc1t0YWJsZV1bJ2RidGltZXN0YW1wJ10gPSBjb2x1bW47XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBlbHNlIGlmICh0eXBlRGVmLmluZGV4T2YoJ2lzZGVsZXRlZCcpPT09MCl7XHJcbiAgICAgICAgICAgICAgICAgICAgdGIuYWRkQ29sdW1uKGNvbHVtbiwgbGYuVHlwZS5CT09MRUFOKTtcclxuICAgICAgICAgICAgICAgICAgICBvcHRpb25zW3RhYmxlXVsnaXNkZWxldGVkJ10gPSBjb2x1bW47XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBpZiAoaXNDb2x1bW4pIHtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAvLyBhZGQgaW5kZWNlcyBhbmQgdW5pcXVlIGNvbnN0cmFpbnRzIGlmIHJlcXVlc3RlZFxyXG4gICAgICAgICAgICAgICAgICAgIHZhciBvcHMgPSB0eXBlRGVmLnNwbGl0KCcsJylcclxuICAgICAgICAgICAgICAgICAgICBpZiAob3BzLmluZGV4T2YoJ2luZGV4JykgIT09IC0xKXsgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgdW5pcXVlID0gKG9wcy5pbmRleE9mKCd1bmlxdWUnKSAhPT0gLTEpOyAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgaW5kZWNlcy5wdXNoKGNvbHVtbik7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChvcHMuaW5kZXhPZignbnVsbCcpICE9PSAtMSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgbnVsbGFibGVzLnB1c2goY29sdW1uKTtcclxuICAgICAgICAgICAgICAgICAgICBjb2x1bW5zW3RhYmxlXS5wdXNoKGNvbHVtbik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAocGtleXMubGVuZ3RoID09PTApIHRocm93IGBTY2hlbWEgRXJyb3I6IG5vIHByaW1hcnkga2V5IHdhcyBzcGVjaWZpZWQgZm9yIHRhYmxlICcke3RhYmxlfSdgO1xyXG4gICAgICAgICAgICBpZiAocGtleXMubGVuZ3RoID4gMSkgdGhyb3cgYFNjaGVtYSBFcnJvcjogbW9yZSB0aGFuIG9uZSBwcmltYXJ5IGtleSB3YXMgc3BlY2lmaWVkIGZvciB0YWJsZSAnJHt0YWJsZX0nYDtcclxuICAgICAgICAgICAgdGIuYWRkUHJpbWFyeUtleShwa2V5cyk7IFxyXG4gICAgICAgICAgICB0Yi5hZGROdWxsYWJsZShudWxsYWJsZXMpO1xyXG4gICAgICAgICAgICB0Yi5hZGRJbmRleChgaXhfJHt0YWJsZX1gLCBpbmRlY2VzKTsgXHJcbiAgICAgICAgfSAgICAgIFxyXG4gICAgICAgIFxyXG4gICAgICAgIERCU2NoZW1hSW50ZXJuYWwuaW5zdGFuY2VNYXBbZGJOYW1lXSA9IFxyXG4gICAgICAgICAgICBuZXcgREJJbnN0YW5jZShkYk5hbWUsIGRiVmVyc2lvbiwgc2NoZW1hQnVpbGRlciwgY29sdW1ucywgbmF2LCB0YWJsZXMsIGZrLCBvcHRpb25zLCBwayk7XHJcbiAgICAgICAgXHJcbiAgICB9XHJcbiAgICBcclxufVxyXG5jbGFzcyBEQlNjaGVtYUludGVybmFsICB7XHJcbiAgICBwdWJsaWMgc3RhdGljIGluc3RhbmNlTWFwIDoge30gPSB7fTsgXHJcbn1cclxuY2xhc3MgREJJbnN0YW5jZSB7XHJcbiAgICBjb25zdHJ1Y3RvciggXHJcbiAgICAgICAgcHVibGljIGRiTmFtZTogc3RyaW5nLFxyXG4gICAgICAgIHB1YmxpYyBkYlZlcnNpb246IG51bWJlciwgXHJcbiAgICAgICAgcHVibGljIHNjaGVtYUJ1aWxkZXI6IGxmLnNjaGVtYS5CdWlsZGVyLFxyXG4gICAgICAgIHB1YmxpYyBzY2hlbWE6IE9iamVjdCxcclxuICAgICAgICBwdWJsaWMgbmF2OiBPYmplY3QsXHJcbiAgICAgICAgcHVibGljIHRhYmxlczogc3RyaW5nW10sXHJcbiAgICAgICAgcHVibGljIGZrOiBPYmplY3QsXHJcbiAgICAgICAgcHVibGljIG9wdGlvbnM6IE9iamVjdCxcclxuICAgICAgICBwdWJsaWMgcGs6IE9iamVjdCl7fVxyXG4gICAgICAgIFxyXG4gICAgcHVibGljIG5ld1RhYmxlTWFwKCl7XHJcbiAgICAgICAgdmFyIG1hcCA9IHt9O1xyXG4gICAgICAgIGZvciAodmFyIGk9MCA7IGk8dGhpcy50YWJsZXMubGVuZ3RoOyBpKyspe1xyXG4gICAgICAgICAgICBtYXBbdGhpcy50YWJsZXNbaV1dPVtdO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbWFwO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgREJDb250ZXh0PEVfQ1RYPiB7XHJcbiAgICBcclxuICAgIHByaXZhdGUgY29udGV4dCA6ICBEQkNvbnRleHRJbnRlcm5hbDtcclxuXHJcbiAgICBwdWJsaWMgcmVhZHk6IFByb21pc2U8YW55PjsgICAgXHJcbiAgICBwcml2YXRlIGxvYWRpbmc6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIHByaXZhdGUgbG9hZGVkOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICBcclxuICAgIGNvbnN0cnVjdG9yKGRiTmFtZTogc3RyaW5nLCBkYlN0b3JlVHlwZT86IGxmLnNjaGVtYS5EYXRhU3RvcmVUeXBlLCBkYlNpemVNQj86IG51bWJlcikgeyAgICAgICBcclxuICAgICAgICB0aGlzLmNvbnRleHQgPSBuZXcgREJDb250ZXh0SW50ZXJuYWwoKTtcclxuICAgICAgICB0aGlzLmNvbnRleHQuZGJTdG9yZVR5cGUgPSAoZGJTdG9yZVR5cGU9PT11bmRlZmluZWQpID8gbGYuc2NoZW1hLkRhdGFTdG9yZVR5cGUuV0VCX1NRTCA6IGRiU3RvcmVUeXBlOyBcclxuICAgICAgICB0aGlzLmNvbnRleHQuZGJJbnN0YW5jZSA9IERCU2NoZW1hSW50ZXJuYWwuaW5zdGFuY2VNYXBbZGJOYW1lXTsgICAgICAgICBcclxuICAgICAgICB2YXIgZGJTaXplID0gKGRiU2l6ZU1CIHx8IDEpICogMTAyNCAqIDEwMjQ7IC8qIGRiIHNpemUgMTAyNCoxMDI0ID0gMU1CICovXHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xyXG4gICAgICAgIHRoaXMucmVhZHkgPSBuZXcgUHJvbWlzZSgocmVzb2x2ZSxyZWplY3QpPT57XHJcbiAgICAgICAgICAgIHRyeXtcclxuICAgICAgICAgICAgdGhpcy5jb250ZXh0LmRiSW5zdGFuY2Uuc2NoZW1hQnVpbGRlci5jb25uZWN0KHsgXHJcbiAgICAgICAgICAgICAgICBzdG9yZVR5cGU6IHNlbGYuY29udGV4dC5kYlN0b3JlVHlwZSxcclxuICAgICAgICAgICAgICAgIHdlYlNxbERiU2l6ZTogZGJTaXplIH0pXHJcbiAgICAgICAgICAgIC50aGVuKGRiID0+IHsgXHJcbiAgICAgICAgICAgICAgICB0aGlzLmNvbnRleHQuZGIgPSBkYjtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgLy8gZ2V0IHNjaGVtYSBmb3IgdGFibGVzXHJcbiAgICAgICAgICAgICAgICB0aGlzLmNvbnRleHQudGFibGVTY2hlbWFNYXAgPSB0aGlzLmNvbnRleHQuZGJJbnN0YW5jZS5uZXdUYWJsZU1hcCgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jb250ZXh0LnRhYmxlcyA9IFtdO1xyXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgdGFibGUgaW4gdGhpcy5jb250ZXh0LnRhYmxlU2NoZW1hTWFwICApe1xyXG4gICAgICAgICAgICAgICAgICAgIGxldCB0PSB0aGlzLmNvbnRleHQuZGIuZ2V0U2NoZW1hKCkudGFibGUodGFibGUpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29udGV4dC50YWJsZVNjaGVtYU1hcFt0YWJsZV0gPSB0OyAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbnRleHQudGFibGVzLnB1c2godCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIH0pOyAgICAgICAgICAgXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY2F0Y2ggKGUpe1xyXG4gICAgICAgICAgICAgICAgcmVqZWN0KGUpO1xyXG4gICAgICAgICAgICB9ICAgXHJcbiAgICAgICAgfSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyB0aGlzIHdpbGwgZGVsZXRlIGFsbCByb3dzIGZyb20gYWxsIHRhYmxlcyBhZCBwdXJnZSBhbGwga2V5IGFuZCBkYnRpbWVzdGFtcCBpbmRlY2VzIFxyXG4gICAgcHVibGljIHB1cmdlKCkgOiBQcm9taXNlPGFueT4ge1xyXG4gICAgICAgIHZhciB0eD0gdGhpcy5jb250ZXh0LmRiLmNyZWF0ZVRyYW5zYWN0aW9uKCk7XHJcbiAgICAgICAgdmFyIHE9W107XHJcbiAgICAgICAgZm9yICh2YXIgdE5hbWUgaW4gdGhpcy5jb250ZXh0LnRhYmxlU2NoZW1hTWFwKXtcclxuICAgICAgICAgICAgdmFyIHRhYmxlID0gdGhpcy5jb250ZXh0LnRhYmxlU2NoZW1hTWFwW3ROYW1lXTtcclxuICAgICAgICAgICAgcS5wdXNoKHRoaXMuY29udGV4dC5kYi5kZWxldGUoKS5mcm9tKHRhYmxlKSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB0aGlzLmNvbnRleHQucHVyZ2VLZXlzKHROYW1lKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5jb250ZXh0LnB1cmdlS2V5cygnZGJ0aW1lc3RhbXAnKTtcclxuICAgICAgICByZXR1cm4gdHguZXhlYyhxKTtcclxuICAgIH1cclxuICAgICAgICBcclxuICAgIC8vIG9wZW4gYSBuZXcgdHJhbnNhY3Rpb24gd2l0aCBhbiBleGNsdXNpdmUgbG9jayBvbiB0aGUgc3BlY2lmaWVkIHRhYmxlc1xyXG4gICAgcHVibGljIHRyYW5zYWN0aW9uKCBmbjogKHR4OiBsZi5UcmFuc2FjdGlvbiwgY29udGV4dDogRV9DVFgpPT5Qcm9taXNlPGFueT4pIDogUHJvbWlzZTxhbnk+e1xyXG4gICAgICAgIHRoaXMuY29udGV4dC50eD0gdGhpcy5jb250ZXh0LmRiLmNyZWF0ZVRyYW5zYWN0aW9uKCk7XHJcbiAgICAgICAgLy8gZ2V0IGEgbG9jayBvbiBhbGwgdGhlIHRhYmxlcyBpbiB0aGUgREJDb250ZXh0XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udGV4dC50eC5iZWdpbih0aGlzLmNvbnRleHQudGFibGVzKS50aGVuKCgpPT57XHJcbiAgICAgICAgICAgIHZhciBwPSBmbih0aGlzLmNvbnRleHQudHgsPEVfQ1RYPnRoaXMuY29udGV4dC50YWJsZVNjaGVtYU1hcCkudGhlbigoKT0+e1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jb250ZXh0LnR4LmNvbW1pdCgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jb250ZXh0LnR4PSB1bmRlZmluZWQ7ICAgIFxyXG4gICAgICAgICAgICB9KTsgICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm4gcDsgICAgICAgXHJcbiAgICAgICAgfSk7ICAgICAgICAgXHJcbiAgICB9XHJcbiAgICBcclxuICAgIHB1YmxpYyBnZXQgdGFibGVzKCkgOiBFX0NUWHtcclxuICAgICAgICByZXR1cm4gPEVfQ1RYPnRoaXMuY29udGV4dC50YWJsZVNjaGVtYU1hcDtcclxuICAgIH1cclxuICAgIHB1YmxpYyBzZWxlY3QoLi4uY29sdW1uczogbGYuc2NoZW1hLkNvbHVtbltdKSA6IGxmLnF1ZXJ5LlNlbGVjdCB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udGV4dC5kYi5zZWxlY3QuYXBwbHkodGhpcy5jb250ZXh0LmRiLGNvbHVtbnMpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBwdWJsaWMgZ2V0Q2hlY2twb2ludCgpIDogbnVtYmVyIHtcclxuICAgICAgICBpZiAoIWxvY2FsU3RvcmFnZSkgdGhyb3cgbmV3IEVycm9yKCdsb2NhbHN0b3JhZ2Ugbm90IHN1cHBvcnRlZCEnKTtcclxuICAgICAgICB2YXIga2V5ID0gYCR7dGhpcy5jb250ZXh0LmRiSW5zdGFuY2UuZGJOYW1lfSR7dGhpcy5jb250ZXh0LmRiU3RvcmVUeXBlfS5kYnRpbWVzdGFtcC5tYXN0ZXJJbmRleGA7XHJcbiAgICAgICAgdmFyIHM9bG9jYWxTdG9yYWdlLmdldEl0ZW0oa2V5KTtcclxuICAgICAgICBpZiAoIXMpIHJldHVybiAwXHJcbiAgICAgICAgdmFyIG4gPSBwYXJzZUludChzKTtcclxuICAgICAgICBpZiAoaXNOYU4obikpIHJldHVybiAwO1xyXG4gICAgICAgIHJldHVybiBuO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBcclxuICAgIHB1YmxpYyBEQkVudGl0eTxULCBFX0NUWCwgVF9DVFg+KCB0YWJsZU5hbWU6c3RyaW5nLCBuYXZpZ2F0aW9uUHJvcGVydGllcz86IHN0cmluZ1tdICl7ICAgICAgICAgICAgICAgIFxyXG4gICAgICAgIHJldHVybiA8REJFbnRpdHk8VCwgRV9DVFgsIFRfQ1RYPj4obmV3IERCRW50aXR5SW50ZXJuYWw8VCwgRV9DVFgsIFRfQ1RYPih0aGlzLmNvbnRleHQsIHRhYmxlTmFtZSwgbmF2aWdhdGlvblByb3BlcnRpZXMsIHRoaXMucmVhZHkpKTtcclxuICAgIH0gICAgICAgICAgXHJcbn1cclxuXHJcbi8vIHByaXZhdGUgY2xhc3Nlc1xyXG5jbGFzcyBEQkNvbnRleHRJbnRlcm5hbCB7XHJcbiAgICBwdWJsaWMgZGJJbnN0YW5jZTogREJJbnN0YW5jZTtcclxuICAgIHB1YmxpYyBkYlN0b3JlVHlwZTogbGYuc2NoZW1hLkRhdGFTdG9yZVR5cGU7XHJcbiAgICBwdWJsaWMgZGI6IGxmLkRhdGFiYXNlO1xyXG4gICAgcHVibGljIHRhYmxlU2NoZW1hTWFwOiBPYmplY3Q7XHJcbiAgICBwdWJsaWMgdGFibGVzOiBsZi5zY2hlbWEuVGFibGVbXTtcclxuICAgIHB1YmxpYyB0eDogbGYuVHJhbnNhY3Rpb247XHJcbiAgICBcclxuICAgIHB1YmxpYyBjb21wb3NlKHRhYmxlOiBzdHJpbmcsIHJvd3M6IE9iamVjdFtdLCBma21hcDogT2JqZWN0KSA6IE9iamVjdFtdIHtcclxuICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgdmFyIG1hcCA9ZmttYXBbdGFibGVdO1xyXG4gICAgICAgIC8vIGlmIHRoZXJlIGFyZSBubyBmb3JlaWduIGtleXMgdGhlcmUgaXMgbm90aGluZyBtb3JlIHRvIGNvbXBvc2VcclxuICAgICAgICBpZiAobWFwID09PSB1bmRlZmluZWQpIHJldHVybiByb3dzO1xyXG4gICAgICAgIHZhciBrZXkgPSBtYXAuY29sdW1uMjsgICAgICAgIFxyXG5cclxuICAgICAgICAvLyBlbnRpdGllc1xyXG4gICAgICAgIGNvbnN0IGVudGl0aWVzOiBPYmplY3RbXSA9IFtdO1xyXG4gICAgICAgIGNvbnN0IGRpc3RpbmN0OiBPYmplY3RbXVtdPSBbXTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBrZXl2YWx1ZXMgPSB7fTtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHJvd3MubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3Qgcm93ID0gcm93c1tpXTtcclxuICAgICAgICAgICAgY29uc3Qga2V5dmFsdWUgPSByb3dbdGFibGVdW2tleV07XHJcbiAgICAgICAgICAgIGlmICh1bmRlZmluZWQgPT09IGtleXZhbHVlc1trZXl2YWx1ZV0pIHtcclxuICAgICAgICAgICAgICAgIGtleXZhbHVlc1trZXl2YWx1ZV0gPSBlbnRpdGllcy5sZW5ndGg7IC8vc3RvcmUgdGhlIGluZGV4XHJcbiAgICAgICAgICAgICAgICB2YXIgZmlyc3QgPSByb3dbdGFibGVdOyAvLyBvbmx5IHNhdmUgdGhlIGZpcnN0IGVsZW1lbnQgd2l0aCB0aGlzIGtleXZhbHVlXHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIC8vIGNsb25lIGJlZm9yZSBtYWtpbmcgbW9kaWZpY2F0aW9uIHRvIHByZXZlbnQgbG92ZWZpZWxkIGluZGV4IGNhY2hlIGZyb21cclxuICAgICAgICAgICAgICAgIC8vIGJlaW5nIGNvcnJ1cHRlZFxyXG4gICAgICAgICAgICAgICAgdmFyIGNsb25lID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShmaXJzdCkpO1xyXG4gICAgICAgICAgICAgICAgZW50aXRpZXMucHVzaChjbG9uZSk7ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdmFyIGluZGV4ID0ga2V5dmFsdWVzW2tleXZhbHVlXTtcclxuICAgICAgICAgICAgaWYgKGRpc3RpbmN0W2luZGV4XT09PSB1bmRlZmluZWQpXHJcbiAgICAgICAgICAgICAgICBkaXN0aW5jdFtpbmRleF0gPSBbXTtcclxuICAgICAgICAgICAgZGlzdGluY3RbaW5kZXhdLnB1c2gocm93KTsgLy8gc3RvcmUgdGhlIHJvdyBpbiBhIGxvb2t1cCB0YWJsZVxyXG4gICAgICAgICAgICBcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgZm9yICh2YXIga2V5dmFsdWUgaW4ga2V5dmFsdWVzKXtcclxuICAgICAgICAgICAgY29uc3QgaW5kZXggPSBrZXl2YWx1ZXNba2V5dmFsdWVdO1xyXG4gICAgICAgICAgICByb3dzID0gZGlzdGluY3RbaW5kZXhdO1xyXG5cclxuICAgICAgICAgICAgLy8gcG9zaXRpb24gY2hpbGRyZW4gKHJlY3Vyc2l2ZSlcclxuICAgICAgICAgICAgZm9yICh2YXIgej0wOyB6PCByb3dzLmxlbmd0aDsgeisrKXtcclxuICAgICAgICAgICAgICAgIC8vIGNsb25lIGJlZm9yZSBtYWtpbmcgbW9kaWZpY2F0aW9uIHRvIHByZXZlbnQgbG92ZWZpZWxkIGluZGV4IGNhY2hlIGZyb21cclxuICAgICAgICAgICAgICAgIC8vIGJlaW5nIGNvcnJ1cHRlZFxyXG4gICAgICAgICAgICAgICAgdmFyIHJvdyA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkocm93c1t6XSkpOyAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHRoaXMuY29tcG9zZV8odGFibGUscm93LGVudGl0aWVzW2luZGV4XSk7XHJcbiAgICAgICAgICAgIH0gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGVudGl0aWVzO1xyXG4gICAgfSBcclxuICAgIFxyXG4gICAgcHJpdmF0ZSBjb21wb3NlXyh0YWJsZTpzdHJpbmcsIHJvdzogT2JqZWN0LCBwYXJlbnQ6IE9iamVjdCkge1xyXG4gICAgICAgIHZhciBuYXZzID0gdGhpcy5kYkluc3RhbmNlLm5hdlt0YWJsZV07XHJcbiAgICAgICAgZm9yICh2YXIgY29sdW1uIGluIG5hdnMpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB2YXIgbmF2ID0gbmF2c1tjb2x1bW5dO1xyXG4gICAgICAgICAgICB2YXIgY2hpbGQgPSByb3dbbmF2LnRhYmxlTmFtZV07XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBidWc/IGluIHNvbWUgY2FzZXMgY2hpbGQgaXMgdW5kZWZpbmVkXHJcbiAgICAgICAgICAgIGlmIChjaGlsZCl7XHJcbiAgICAgICAgICAgICAgICBpZiAobmF2LmlzQXJyYXkpe1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh1bmRlZmluZWQgPT09IHBhcmVudFtuYXYuY29sdW1uTmFtZV0pXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudFtuYXYuY29sdW1uTmFtZV0gPSBbY2hpbGRdXHJcbiAgICAgICAgICAgICAgICAgICAgZWxzZSBcclxuICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50W25hdi5jb2x1bW5OYW1lXS5wdXNoKGNoaWxkKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudFtuYXYuY29sdW1uTmFtZV0gPSBjaGlsZDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHRoaXMuY29tcG9zZV8obmF2LnRhYmxlTmFtZSwgcm93LCBjaGlsZClcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICAgICAgXHJcbiAgICBwdWJsaWMgZGVjb21wb3NlKCB0YWJsZTpzdHJpbmcsIGVudGl0aWVzOiBPYmplY3RbXSApe1xyXG4gICAgICAgIHZhciBtYXAgPSB0aGlzLmRiSW5zdGFuY2UubmV3VGFibGVNYXAoKTtcclxuICAgICAgICBmb3IgKHZhciBpPTA7IGk8ZW50aXRpZXMubGVuZ3RoOyBpKyspe1xyXG4gICAgICAgICAgICB2YXIgZT1lbnRpdGllc1tpXTtcclxuICAgICAgICAgICAgbWFwW3RhYmxlXS5wdXNoKGUpO1xyXG4gICAgICAgICAgICB0aGlzLmRlY29tcG9zZV8odGFibGUsIGUsIG1hcCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBtYXA7XHJcbiAgICB9XHJcbiAgICBwcml2YXRlIGRlY29tcG9zZV8oIHRhYmxlOnN0cmluZywgZW50aXR5OiBPYmplY3QsIG1hcDogT2JqZWN0ICl7XHJcbiAgICAgICAgZm9yICh2YXIgcHJvcCBpbiBlbnRpdHkpe1xyXG4gICAgICAgICAgICB2YXIgbmF2ID0gdGhpcy5kYkluc3RhbmNlLm5hdlt0YWJsZV1bcHJvcF07XHJcbiAgICAgICAgICAgIGlmIChuYXYgIT09IHVuZGVmaW5lZCl7XHJcbiAgICAgICAgICAgICAgICB2YXIgdmFsdWUgPSBlbnRpdHlbcHJvcF07XHJcbiAgICAgICAgICAgICAgICBpZiAoaXMuYXJyYXkodmFsdWUpKXtcclxuICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBpPTA7IGk8dmFsdWUubGVuZ3RoOyBpKyspe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBtYXBbbmF2LnRhYmxlTmFtZV0ucHVzaCh2YWx1ZVtpXSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVjb21wb3NlXyhuYXYudGFibGVOYW1lLCB2YWx1ZVtpXSwgbWFwKTsgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoaXMub2JqZWN0KHZhbHVlKSl7XHJcbiAgICAgICAgICAgICAgICAgICAgbWFwW25hdi50YWJsZU5hbWVdLnB1c2godmFsdWUpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZGVjb21wb3NlXyhuYXYudGFibGVOYW1lLCB2YWx1ZSwgbWFwKTtcclxuICAgICAgICAgICAgICAgIH0gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9ICAgIFxyXG5cclxuICAgIHB1YmxpYyBhbGxvY2F0ZUtleXModGFibGU6c3RyaW5nLCB0YWtlPzpudW1iZXIpOm51bWJlciB7XHJcbiAgICAgICAgdmFyIGtleSA9IGAke3RoaXMuZGJJbnN0YW5jZS5kYk5hbWV9JHt0aGlzLmRiU3RvcmVUeXBlfS4ke3RhYmxlfS5tYXN0ZXJJbmRleGA7XHJcbiAgICAgICAgdmFyIGxzdmFsdWUgPSB3aW5kb3cubG9jYWxTdG9yYWdlLmdldEl0ZW0oIGtleSApO1xyXG4gICAgICAgIHZhciB2YWx1ZTpudW1iZXIsIG5leHR2YWx1ZTpudW1iZXI7XHJcbiAgICAgICAgaWYgKGxzdmFsdWUgPT09IG51bGwpIHZhbHVlPTE7IGVsc2UgdmFsdWUgPSBwYXJzZUludChsc3ZhbHVlKTtcclxuICAgICAgICBuZXh0dmFsdWUgPSB2YWx1ZTtcclxuICAgICAgICBpZiAoIXRha2UpIHRha2U9MTtcclxuICAgICAgICBuZXh0dmFsdWUgKz0gdGFrZTsgXHJcbiAgICAgICAgd2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKGtleSwgbmV4dHZhbHVlLnRvU3RyaW5nKCkpO1xyXG4gICAgICAgIC8vY29uc29sZS5sb2coYCR7dGFibGV9OiR7dmFsdWV9YCk7XHJcbiAgICAgICAgcmV0dXJuIHZhbHVlOyAgICAgICAgXHJcbiAgICB9XHJcbiAgICBwdWJsaWMgcm9sbGJhY2tLZXlzKHRhYmxlOnN0cmluZywgaWRJbmRleDpudW1iZXIpe1xyXG4gICAgICAgIHZhciBrZXkgPSBgJHt0aGlzLmRiSW5zdGFuY2UuZGJOYW1lfSR7dGhpcy5kYlN0b3JlVHlwZX0uJHt0YWJsZX0ubWFzdGVySW5kZXhgO1xyXG4gICAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbShrZXksIChpZEluZGV4LTEpLnRvU3RyaW5nKCkpO1xyXG4gICAgfVxyXG4gICAgcHVibGljIHB1cmdlS2V5cyh0YWJsZTpzdHJpbmcpIHtcclxuICAgICAgICB2YXIga2V5ID0gYCR7dGhpcy5kYkluc3RhbmNlLmRiTmFtZX0ke3RoaXMuZGJTdG9yZVR5cGV9LiR7dGFibGV9Lm1hc3RlckluZGV4YDtcclxuICAgICAgICBsb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbShrZXkpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBwdWJsaWMgZXhlYyhxOmFueSl7XHJcbiAgICAgICAgaWYgKHRoaXMudHgpe1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy50eC5hdHRhY2gocSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICByZXR1cm4gcS5leGVjKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfSAgIFxyXG4gICAgXHJcbiAgICBwdWJsaWMgZXhlY01hbnkocTphbnlbXSl7XHJcbiAgICAgICAgaWYgKHRoaXMudHgpeyAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBxPXEucmV2ZXJzZSgpO1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fZXhlY01hbnkocSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICB2YXIgdHggPSB0aGlzLmRiLmNyZWF0ZVRyYW5zYWN0aW9uKCk7XHJcbiAgICAgICAgICAgIHJldHVybiB0eC5leGVjKHEpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHByaXZhdGUgX2V4ZWNNYW55KHE6YW55W10pe1xyXG4gICAgICAgIHZhciBxMSA9IHEucG9wKCk7XHJcbiAgICAgICAgdmFyIGEgPSB0aGlzLnR4LmF0dGFjaChxMSk7XHJcbiAgICAgICAgaWYgKHEubGVuZ3RoID09PSAwKSByZXR1cm4gYTtcclxuICAgICAgICBlbHNlIHJldHVybiBhLnRoZW4oKCk9PnsgcmV0dXJuIHRoaXMuZXhlY01hbnkocSkgfSk7XHJcbiAgICB9XHJcbiAgICAgXHJcbn1cclxuXHJcbmludGVyZmFjZSBRdWVyeUpvaW4ge1xyXG4gICAgdGFibGU6IGxmLnNjaGVtYS5UYWJsZTtcclxuICAgIHByZWRpY2F0ZWxlZnQ6IGxmLnNjaGVtYS5Db2x1bW47XHJcbiAgICBwcmVkaWNhdGVyaWdodDogbGYuc2NoZW1hLkNvbHVtbjtcclxufVxyXG5cclxuY2xhc3MgREJFbnRpdHlJbnRlcm5hbDxULCBFX0NUWCwgVF9DVFg+IGltcGxlbWVudHMgREJFbnRpdHk8VCwgRV9DVFgsIFRfQ1RYPiB7XHJcblxyXG4gICAgcHJpdmF0ZSBjb250ZXh0IDogREJDb250ZXh0SW50ZXJuYWw7XHJcbiAgICBwcml2YXRlIHRhYmxlTmFtZSA6IHN0cmluZztcclxuICAgIHByaXZhdGUgbmF2aWdhdGlvblByb3BlcnRpZXM6IHN0cmluZ1tdPVtdO1xyXG4gICAgcHJpdmF0ZSBuYXZpZ2F0aW9uVGFibGVzOiBzdHJpbmdbXT1bXTtcclxuICAgIHByaXZhdGUgdGFibGVzOiBzdHJpbmdbXT1bXTtcclxuICAgIHByaXZhdGUgbmF2OiBPYmplY3Q7XHJcbiAgICBwcml2YXRlIGZrbWFwOiBPYmplY3Q7XHJcbiAgICBwcml2YXRlIHBrOiBzdHJpbmc7XHJcbiAgICBcclxuICAgIC8vIHVzZWQgZm9yIHF1ZXJ5KClcclxuICAgIHByaXZhdGUgam9pbjogUXVlcnlKb2luW109W107XHJcbiAgICBwcml2YXRlIHRibG1hcDogT2JqZWN0PXt9O1xyXG4gICAgXHJcbiAgICBjb25zdHJ1Y3Rvcihjb250ZXh0OiBEQkNvbnRleHRJbnRlcm5hbCwgdGFibGVOYW1lOnN0cmluZywgbmF2aWdhdGlvblByb3BlcnRpZXM/OiBzdHJpbmdbXSwgcmVhZHk/OiBQcm9taXNlPGFueT4pIHtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgIHRoaXMuY29udGV4dCA9IGNvbnRleHQ7XHJcbiAgICAgICAgdGhpcy50YWJsZU5hbWUgPSB0YWJsZU5hbWU7ICAgICAgICBcclxuICAgICAgICB0aGlzLm5hdmlnYXRpb25Qcm9wZXJ0aWVzID0gbmF2aWdhdGlvblByb3BlcnRpZXMgfHwgW107XHJcbiAgICAgICAgdGhpcy5uYXYgPSBjb250ZXh0LmRiSW5zdGFuY2UubmF2W3RhYmxlTmFtZV07XHJcbiAgICAgICAgdGhpcy5wayA9IGNvbnRleHQuZGJJbnN0YW5jZS5wa1t0YWJsZU5hbWVdO1xyXG4gICAgICAgIGZvciAodmFyIGNvbHVtbiBpbiB0aGlzLm5hdilcclxuICAgICAgICAgICAgdGhpcy5uYXZpZ2F0aW9uVGFibGVzLnB1c2goIHRoaXMubmF2W2NvbHVtbl0udGFibGVOYW1lKTtcclxuICAgICAgICBmb3IgKHZhciBpPTA7IGk8dGhpcy5uYXZpZ2F0aW9uVGFibGVzLmxlbmd0aDsgaSsrKVxyXG4gICAgICAgICAgICB0aGlzLnRhYmxlcy5wdXNoKHRoaXMubmF2aWdhdGlvblRhYmxlc1tpXSk7XHJcbiAgICAgICAgdGhpcy50YWJsZXMucHVzaCh0aGlzLnRhYmxlTmFtZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5ma21hcCA9IHt9O1xyXG4gICAgICAgIGZvciAodmFyIGk9MDsgaTx0aGlzLnRhYmxlcy5sZW5ndGg7IGkrKyl7XHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciB0YWJsZU5hbWUgPSB0aGlzLnRhYmxlc1tpXTsgICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGZrZXlzID0gdGhpcy5jb250ZXh0LmRiSW5zdGFuY2UuZmtbdGFibGVOYW1lXTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIGRldGVybWluZSBpZiB0aGVyZSBhcmUgZmtleXMgdG8gYW55IG5hdmlnYXRpb24gdGFibGVzXHJcbiAgICAgICAgICAgIGZvciAodmFyIGNvbHVtbiBpbiBma2V5cyl7XHJcbiAgICAgICAgICAgICAgICB2YXIgZmsgPSBma2V5c1tjb2x1bW5dO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMudGFibGVzLmluZGV4T2YoZmsuZmtUYWJsZSkgIT09IC0xKXtcclxuICAgICAgICAgICAgICAgICAgICAvL2ZrbWFwW3RhYmxlTmFtZV0ucHVzaChmayk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ma21hcFt0YWJsZU5hbWVdPXtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGFibGUxOiB0YWJsZU5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbHVtbjE6IGNvbHVtbixcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGFibGUyOiBmay5ma1RhYmxlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2x1bW4yOiBmay5ma0NvbHVtblxyXG4gICAgICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ma21hcFtmay5ma1RhYmxlXT17XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhYmxlMTogZmsuZmtUYWJsZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29sdW1uMTogZmsuZmtDb2x1bW4sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhYmxlMjogdGFibGVOYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2x1bW4yOiBjb2x1bW5cclxuICAgICAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgfSAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIHNvcnQgdGFibGVzIGZvciB3cml0aW5nIGluIHRoZSBjb3JyZWN0IG9yZGVyIChmayBjb25zdHJhaW50cylcclxuICAgICAgICB0aGlzLnRhYmxlcy5zb3J0KChhLGIpPT57XHJcbiAgICAgICAgICAgIHZhciB0MSA9IHRoaXMuZmttYXBbYV07XHJcbiAgICAgICAgICAgIHZhciB0MiA9IHRoaXMuZmttYXBbYl07XHJcbiAgICAgICAgICAgIC8vaWYgKGlzLnVuZGVmaW5lZCh0MSkpIHJldHVybiAxO1xyXG4gICAgICAgICAgICAvL2lmIChpcy51bmRlZmluZWQodDIpKSByZXR1cm4gLTE7XHJcbiAgICAgICAgICAgIGlmICh0MS50YWJsZTIgPT09IGIpIHJldHVybiAtMTtcclxuICAgICAgICAgICAgaWYgKHQyLnRhYmxlMiA9PT0gYSkgcmV0dXJuIDE7XHJcbiAgICAgICAgICAgIHJldHVybiAwO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIC8vY29uc29sZS5sb2codGhpcy50YWJsZXMpO1xyXG4gICAgICAgXHJcbiAgICAgICAgLypcclxuICAgICAgICBjb25zb2xlLmdyb3VwKHRoaXMudGFibGVOYW1lKTsgICAgICAgIFxyXG4gICAgICAgIGNvbnNvbGUubG9nKHRoaXMuZmttYXApO1xyXG4gICAgICAgIGNvbnNvbGUuZ3JvdXBFbmQoKTtcclxuICAgICAgICAqL1xyXG4gICAgICAgIHJlYWR5LnRoZW4oKCk9PntcclxuICAgICAgICAgICAgLy8gbWFwIHRhYmxlcyBmb3Igam9pbnNcclxuICAgICAgICAgICAgdmFyIHRhYmxlU2NoZW1hID0gY29udGV4dC50YWJsZVNjaGVtYU1hcFt0aGlzLnRhYmxlTmFtZV07XHJcbiAgICAgICAgICAgIGZvciAodmFyIHByb3AgaW4gdGFibGVTY2hlbWEpe1xyXG4gICAgICAgICAgICAgICAgdGhpc1twcm9wXSA9IHRhYmxlU2NoZW1hW3Byb3BdO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB0aGlzLnRibG1hcFt0aGlzLnRhYmxlTmFtZV0gPSB0YWJsZVNjaGVtYTtcclxuICAgICAgICAgICAgZm9yICh2YXIgaT0wOyBpPHRoaXMubmF2aWdhdGlvblRhYmxlcy5sZW5ndGg7IGkrKyl7ICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciB0YWJsZU5hbWUgPSB0aGlzLm5hdmlnYXRpb25UYWJsZXNbaV07XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRibG1hcFt0YWJsZU5hbWVdID0gdGhpcy5jb250ZXh0LnRhYmxlU2NoZW1hTWFwW3RhYmxlTmFtZV07Ly9kYi5nZXRTY2hlbWEoKS50YWJsZSh0YWJsZU5hbWUpOyAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB9XHJcbiAgICBcclxuICAgICAgICAgICAgZm9yICh2YXIgaT0wOyBpPHRoaXMubmF2aWdhdGlvblRhYmxlcy5sZW5ndGg7IGkrKyl7IFxyXG4gICAgICAgICAgICAgICAgdmFyIHRhYmxlTmFtZSA9IHRoaXMubmF2aWdhdGlvblRhYmxlc1tpXTtcclxuICAgICAgICAgICAgICAgIHZhciBmayA9IHRoaXMuZmttYXBbdGFibGVOYW1lXTsgICAgICAgXHJcbiAgICAgICAgICAgICAgICB2YXIgcCA9IHsgXHJcbiAgICAgICAgICAgICAgICAgICAgdGFibGU6IHRoaXMudGJsbWFwW3RhYmxlTmFtZV0sXHJcbiAgICAgICAgICAgICAgICAgICAgcHJlZGljYXRlbGVmdDogdGhpcy50YmxtYXBbZmsudGFibGUyXVtmay5jb2x1bW4yXSxcclxuICAgICAgICAgICAgICAgICAgICBwcmVkaWNhdGVyaWdodDogdGhpcy50YmxtYXBbZmsudGFibGUxXVtmay5jb2x1bW4xXVxyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIHRoaXMuam9pbi5wdXNoKHApO1xyXG4gICAgICAgICAgICB9ICAgICAgICAgICAgICAgXHJcbiAgICAgICAgfSk7IFxyXG5cclxuICAgIH1cclxuICAgICAgICBcclxuXHRwdWJsaWMgcHV0KGVudGl0eTogYW55KSA6IFByb21pc2U8YW55PiB7XHJcbiAgICAgICAgdmFyIGVudGl0aWVzOiBEQk1vZGVsW107XHJcbiAgICAgICAgaWYgKGlzLmFycmF5KGVudGl0eSkpIGVudGl0aWVzID0gZW50aXR5OyBlbHNlIGVudGl0aWVzID0gW2VudGl0eV07ICAgXHJcbiAgICBcclxuICAgICAgICAvLyBkZWNvbXBvc2UgZW50aXRpZXMgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgdmFyIHRhYmxlcz0gdGhpcy5jb250ZXh0LmRlY29tcG9zZSh0aGlzLnRhYmxlTmFtZSwgZW50aXRpZXMpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIGNhbGN1bGF0ZSBwa2V5c1xyXG4gICAgICAgIHZhciBrZXlzID0ge307XHJcbiAgICAgICAgZm9yIChsZXQgdGFibGVOYW1lIGluIHRhYmxlcyl7XHJcbiAgICAgICAgICAgIGxldCBkaXJ0eVJlY29yZHMgPSB0YWJsZXNbdGFibGVOYW1lXTtcclxuICAgICAgICAgICAgaWYgKGRpcnR5UmVjb3Jkcy5sZW5ndGggPiAwKXsgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAga2V5c1t0YWJsZU5hbWVdID0gdGhpcy5wdXRfY2FsY3VsYXRlS2V5cyhkaXJ0eVJlY29yZHMsdGFibGVOYW1lKTsgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB9ICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgIH0gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICBcclxuICAgICAgICAvLyBjYWxjdWxhdGUgZmtleXNcclxuICAgICAgICBmb3IgKHZhciBpPTA7IGk8ZW50aXRpZXMubGVuZ3RoOyBpKyspe1xyXG4gICAgICAgICAgICB0aGlzLnB1dF9jYWxjdWxhdGVGb3JlaWduS2V5cyh0aGlzLnRhYmxlTmFtZSwgZW50aXRpZXNbaV0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAvLyBwdXQgcm93cyAtIGdldCBxdWVyaWVzXHJcbiAgICAgICAgdmFyIHEgPSBbXTtcclxuICAgICAgICBmb3IgKHZhciBpPTA7IGk8IHRoaXMudGFibGVzLmxlbmd0aDsgaSsrKXsgLy8gdXNlIHRoaXMudGFibGVzIHNpbmNlIGl0cyBwcmVzb3J0ZWQgZm9yIGluc2VydHNcclxuICAgICAgICAgICAgbGV0IHRhYmxlTmFtZSA9IHRoaXMudGFibGVzW2ldOyAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBsZXQgZGlydHlSZWNvcmRzID0gdGFibGVzW3RhYmxlTmFtZV07XHJcbiAgICAgICAgICAgIGlmIChkaXJ0eVJlY29yZHMubGVuZ3RoID4gMCl7ICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHEucHVzaCh0aGlzLnB1dF9leGVjdXRlKGRpcnR5UmVjb3JkcywgdGFibGVOYW1lLCB0aGlzLmNvbnRleHQuZGIsIGtleXMpKTsgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIH0gICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgfSBcclxuICAgICAgICBcclxuICAgICAgICAvLyBleGVjdXRlIC8gYXR0YWNoXHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udGV4dC5leGVjTWFueShxKS50aGVuKFxyXG4gICAgICAgIFxyXG4gICAgICAgIHI9PntcclxuICAgICAgICAgICAgLy8gcmV0dXJuIGp1c3QgdGhlIGlkcyBmb3IgdGhlIHJvb3QgZW50aXRpeVxyXG4gICAgICAgICAgICB2YXIgaWRzID0gZW50aXRpZXMubWFwKCh2YWx1ZTogREJNb2RlbCwgaW5kZXg6IG51bWJlciwgYXJyYXk6IERCTW9kZWxbXSk9PntcclxuICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZVt0aGlzLnBrXTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIGlmIChpZHMubGVuZ3RoID09PSAxKSByZXR1cm4gaWRzWzBdO1xyXG4gICAgICAgICAgICBlbHNlIHJldHVybiBpZHM7ICAgICAgICAgICAgICAgIFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgZT0+e1xyXG4gICAgICAgICAgICBmb3IgKGxldCB0YWJsZU5hbWUgaW4gdGFibGVzKXtcclxuICAgICAgICAgICAgICAgIHZhciByb2xsYmFjayA9IGtleXNbdGFibGVOYW1lXTtcclxuICAgICAgICAgICAgICAgIGlmIChyb2xsYmFjaykge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChyb2xsYmFjay5kYnRzSW5kZXgpIHRoaXMuY29udGV4dC5yb2xsYmFja0tleXMoJ2RidGltZXN0YW1wJywgcm9sbGJhY2suZGJ0c0luZGV4KSAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb250ZXh0LnJvbGxiYWNrS2V5cyh0YWJsZU5hbWUsIHJvbGxiYWNrLmluZGV4KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aHJvdyBlO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgXHJcbiAgICAgICAgLypcclxuICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwocSkudGhlbigoKT0+eyBcclxuICAgICAgICBcclxuICAgICAgICAgICAgLy8gcmV0dXJuIGp1c3QgdGhlIGlkcyBmb3IgdGhlIHJvb3QgZW50aXRpeVxyXG4gICAgICAgICAgICB2YXIgaWRzID0gZW50aXRpZXMubWFwKCh2YWx1ZTogREJNb2RlbCwgaW5kZXg6IG51bWJlciwgYXJyYXk6IERCTW9kZWxbXSk9PntcclxuICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZVt0aGlzLnBrXTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIGlmIChpZHMubGVuZ3RoID09PSAxKSByZXR1cm4gaWRzWzBdO1xyXG4gICAgICAgICAgICBlbHNlIHJldHVybiBpZHM7XHJcbiAgICAgICAgfSk7ICAgICovICAgICAgICAgICBcclxuICAgIH1cclxuICAgIFxyXG4gICAgcHJpdmF0ZSBwdXRfY2FsY3VsYXRlRm9yZWlnbktleXModGFibGU6c3RyaW5nLCBlbnRpdHk6REJNb2RlbCwgcGFyZW50PzpEQk1vZGVsLCBwYXJlbnRUYWJsZT86IHN0cmluZyl7XHJcblxyXG4gICAgICAgIGZvciAodmFyIHByb3AgaW4gZW50aXR5KXtcclxuICAgICAgICAgICAgdmFyIG5hdiA9IHRoaXMuY29udGV4dC5kYkluc3RhbmNlLm5hdlt0YWJsZV1bcHJvcF07ICAgICAgICBcclxuICAgICAgICAgICAgaWYgKG5hdiAhPT0gdW5kZWZpbmVkKXtcclxuICAgICAgICAgICAgICAgIHZhciBma0NvbHVtbnMgPSB0aGlzLmNvbnRleHQuZGJJbnN0YW5jZS5ma1tuYXYudGFibGVOYW1lXTtcclxuICAgICAgICAgICAgICAgIHZhciBwYXJlbnRGa0NvbHVtbnMgPSB0aGlzLmNvbnRleHQuZGJJbnN0YW5jZS5ma1t0YWJsZV07XHJcbiAgICAgICAgICAgICAgICB2YXIgdmFsdWUgPSBlbnRpdHlbcHJvcF07XHJcbiAgICAgICAgICAgICAgICBwYXJlbnQgPSBlbnRpdHk7XHJcbiAgICAgICAgICAgICAgICBpZiAoaXMuYXJyYXkodmFsdWUpKXtcclxuICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBpPTA7IGk8dmFsdWUubGVuZ3RoOyBpKyspe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjYWxjdWxhdGVGb3JlaWduS2V5cyh2YWx1ZVtpXSxlbnRpdHksIGZrQ29sdW1ucywgcGFyZW50RmtDb2x1bW5zLCBuYXYudGFibGVOYW1lLCB0YWJsZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucHV0X2NhbGN1bGF0ZUZvcmVpZ25LZXlzKG5hdi50YWJsZU5hbWUsIHZhbHVlW2ldLCBwYXJlbnQsIHRhYmxlKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChpcy5vYmplY3QodmFsdWUpKXtcclxuICAgICAgICAgICAgICAgICAgICBjYWxjdWxhdGVGb3JlaWduS2V5cyh2YWx1ZSxlbnRpdHksIGZrQ29sdW1ucywgcGFyZW50RmtDb2x1bW5zLCBuYXYudGFibGVOYW1lLCB0YWJsZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wdXRfY2FsY3VsYXRlRm9yZWlnbktleXMobmF2LnRhYmxlTmFtZSwgdmFsdWUsIHBhcmVudCwgdGFibGUpO1xyXG4gICAgICAgICAgICAgICAgfSAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBmdW5jdGlvbiBjYWxjdWxhdGVGb3JlaWduS2V5cyhlbnRpdHk6IERCTW9kZWwsIHBhcmVudDpEQk1vZGVsLCBma0NvbHVtbnM6IE9iamVjdCwgcGFyZW50RmtDb2x1bW5zOiBPYmplY3QsIHRhYmxlOnN0cmluZywgcGFyZW50VGFibGU6c3RyaW5nKXtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBmb3IgKHZhciBjb2x1bW4gaW4gcGFyZW50RmtDb2x1bW5zKXtcclxuICAgICAgICAgICAgICAgIHZhciBma0luZm8gPSBwYXJlbnRGa0NvbHVtbnNbY29sdW1uXTtcclxuICAgICAgICAgICAgICAgIGlmIChma0luZm8uZmtUYWJsZSA9PT0gdGFibGUpeyAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgIHBhcmVudFtjb2x1bW5dID0gZW50aXR5W2ZrSW5mby5ma0NvbHVtbl07IFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBmb3IgKHZhciBjb2x1bW4gaW4gZmtDb2x1bW5zKXtcclxuICAgICAgICAgICAgICAgIHZhciBma0luZm8gPSBma0NvbHVtbnNbY29sdW1uXTsgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmIChma0luZm8uZmtUYWJsZSA9PT0gcGFyZW50VGFibGUpeyAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgIGVudGl0eVtjb2x1bW5dID0gcGFyZW50W2ZrSW5mby5ma0NvbHVtbl07IFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSAgICAgICAgICAgICAgICBcclxuICAgIH1cclxuICAgIFxyXG4gICAgXHJcbiAgICBwcml2YXRlIHB1dF9jYWxjdWxhdGVLZXlzKGRpcnR5UmVjb3JkczogREJNb2RlbFtdLCB0YWJsZU5hbWU6c3RyaW5nKXtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgcGsgPSB0aGlzLmNvbnRleHQuZGJJbnN0YW5jZS5wa1t0YWJsZU5hbWVdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIHNlbGVjdCBhbGwgb2YgdGhlIHJvd3Mgd2l0aG91dCBhIGtleVxyXG4gICAgICAgIHZhciBtaXNzaW5nS2V5OiBudW1iZXJbXSA9IFtdO1xyXG4gICAgICAgIGZvciAodmFyIGk9MDsgaTwgZGlydHlSZWNvcmRzLmxlbmd0aDsgaSsrKSB7ICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoZGlydHlSZWNvcmRzW2ldW3BrXSA9PT0gdW5kZWZpbmVkKSBtaXNzaW5nS2V5LnB1c2goaSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIGFsbG9jYXRlIGtleXNcclxuICAgICAgICB2YXIgaWRJbmRleCA9IHRoaXMuY29udGV4dC5hbGxvY2F0ZUtleXModGFibGVOYW1lLCBtaXNzaW5nS2V5Lmxlbmd0aCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gaW5zZXJ0IGtleXNcclxuICAgICAgICBmb3IgKHZhciBpPTA7IGk8IG1pc3NpbmdLZXkubGVuZ3RoOyBpKyspeyAgICAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgZGlydHlSZWNvcmRzW21pc3NpbmdLZXlbaV1dW3BrXSA9IGlkSW5kZXggKyBpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBhZGQgZGJUaW1lc3RhbXAgKG9wdGlvbmFsKVxyXG4gICAgICAgIHZhciBkYlRpbWVTdGFtcENvbHVtbiA9IHRoaXMuY29udGV4dC5kYkluc3RhbmNlLm9wdGlvbnNbdGFibGVOYW1lXS5kYnRpbWVzdGFtcDtcclxuICAgICAgICB2YXIgZGJUaW1lU3RhbXBJbmRleDtcclxuICAgICAgICBpZiAoZGJUaW1lU3RhbXBDb2x1bW4pe1xyXG4gICAgICAgICAgICBkYlRpbWVTdGFtcEluZGV4ID0gdGhpcy5jb250ZXh0LmFsbG9jYXRlS2V5cygnZGJ0aW1lc3RhbXAnLCBkaXJ0eVJlY29yZHMubGVuZ3RoKVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZm9yICh2YXIgaT0wOyBpPCBkaXJ0eVJlY29yZHMubGVuZ3RoOyBpKyspIHsgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBkaXJ0eVJlY29yZHNbaV1bZGJUaW1lU3RhbXBDb2x1bW5dID0gZGJUaW1lU3RhbXBJbmRleCtpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIGFkZCBvcHRpb25hbCBpc0RlbGV0ZWQgY29sdW1uXHJcbiAgICAgICAgdmFyIGlzRGVsZXRlZENvbHVtbiA9IHRoaXMuY29udGV4dC5kYkluc3RhbmNlLm9wdGlvbnNbdGFibGVOYW1lXS5pc2RlbGV0ZWQ7XHJcbiAgICAgICAgaWYgKGlzRGVsZXRlZENvbHVtbil7XHJcbiAgICAgICAgICAgIGZvciAodmFyIGk9MDsgaTwgZGlydHlSZWNvcmRzLmxlbmd0aDsgaSsrKSB7ICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgZGlydHlSZWNvcmRzW2ldW2lzRGVsZXRlZENvbHVtbl0gPSBmYWxzZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIGluZGV4OiBpZEluZGV4LFxyXG4gICAgICAgICAgICBkYnRzSW5kZXg6IGRiVGltZVN0YW1wSW5kZXhcclxuICAgICAgICB9ICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICB9XHJcbiAgICBcclxuICAgIHByaXZhdGUgcHV0X2V4ZWN1dGUoZGlydHlSZWNvcmRzOiBEQk1vZGVsW10sIHRhYmxlTmFtZTpzdHJpbmcsIGRiOiBsZi5EYXRhYmFzZSwga2V5czogT2JqZWN0KXtcclxuICAgICAgICAvL3JldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSxyZWplY3QpPT57XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gY3JlYXRlIHJvd3MgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgdGFibGUgPSB0aGlzLmNvbnRleHQudGFibGVTY2hlbWFNYXBbdGFibGVOYW1lXTsvL2RiLmdldFNjaGVtYSgpLnRhYmxlKHRhYmxlTmFtZSk7XHJcbiAgICAgICAgICAgIHZhciBjb2x1bW5zID0gdGhpcy5jb250ZXh0LmRiSW5zdGFuY2Uuc2NoZW1hW3RhYmxlTmFtZV07XHJcbiAgICAgICAgICAgIHZhciByb3dzOiBsZi5Sb3dbXSA9IFtdO1xyXG4gICAgICAgICAgICBmb3IgKHZhciBpPTA7IGk8IGRpcnR5UmVjb3Jkcy5sZW5ndGg7IGkrKyl7XHJcbiAgICAgICAgICAgICAgICB2YXIgZSA9IGRpcnR5UmVjb3Jkc1tpXTtcclxuICAgICAgICAgICAgICAgIHZhciByb3cgPSB7fTtcclxuICAgICAgICAgICAgICAgIGZvcih2YXIgeD0wOyB4PCBjb2x1bW5zLmxlbmd0aCA7IHgrKyl7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIGNvbHVtbiA9IGNvbHVtbnNbeF07XHJcbiAgICAgICAgICAgICAgICAgICAgcm93W2NvbHVtbl0gPSBlW2NvbHVtbl07XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByb3dzLnB1c2godGFibGUuY3JlYXRlUm93KHJvdykpO1xyXG4gICAgICAgICAgICB9ICAgICAgICAgICAgICAgIFxyXG4gICAgICAgIFxyXG4gICAgICAgICAgICAvLyB1cHNlcnQgcXVlcnkgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgcSA9IGRiLmluc2VydE9yUmVwbGFjZSgpLmludG8odGFibGUpLnZhbHVlcyhyb3dzKTtcclxuICAgICAgICAgICAgcmV0dXJuIHE7XHJcbiAgICAgICAgICAgIC8qXHJcbiAgICAgICAgICAgIHRoaXMuY29udGV4dC5leGVjKHEpLnRoZW4oXHJcbiAgICAgICAgICAgICAgICByPT57cmVzb2x2ZShyKX0sXHJcbiAgICAgICAgICAgICAgICBlPT57XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIHJvbGxiYWNrID0ga2V5c1t0YWJsZU5hbWVdO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChyb2xsYmFjay5kYnRzSW5kZXgpIHRoaXMuY29udGV4dC5yb2xsYmFja0tleXMoJ2RidGltZXN0YW1wJywgcm9sbGJhY2suZGJ0c0luZGV4KSAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb250ZXh0LnJvbGxiYWNrS2V5cyh0YWJsZU5hbWUsIHJvbGxiYWNrLmluZGV4KTtcclxuICAgICAgICAgICAgICAgICAgICByZWplY3QoZSk7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgKi9cclxuICAgICAgICAvL30pICAgICAgICBcclxuICAgIH1cclxuICAgIFxyXG4gICAgcHVibGljIGdldChpZDogYW55KTogUHJvbWlzZTxhbnk+IHsgICAgICAgIFxyXG4gICAgICAgIHJldHVybiB0aGlzLl9nZXQoaWQpLnRoZW4oKHJlc3VsdHMpPT57ICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBlbnRpdGllcyA9IHRoaXMuY29udGV4dC5jb21wb3NlKHRoaXMudGFibGVOYW1lLCByZXN1bHRzLCB0aGlzLmZrbWFwKTtcclxuICAgICAgICAgICAgaWYgKGlzLmFycmF5KGlkKSB8fCBpcy51bmRlZmluZWQoaWQpKSByZXR1cm4gZW50aXRpZXM7XHJcbiAgICAgICAgICAgIGVsc2UgcmV0dXJuIGVudGl0aWVzWzBdO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgfSAgICBcclxuICAgXHJcbiAgICBwdWJsaWMgX2dldChpZDphbnksIGZvcmNlUHVyZ2U/OiBib29sZWFuKTogUHJvbWlzZTxhbnk+IHtcclxuICAgICAgICB2YXIgZGIgPSB0aGlzLmNvbnRleHQuZGI7XHJcbiAgICAgICAgdmFyIHRhYmxlID0gdGhpcy5jb250ZXh0LnRhYmxlU2NoZW1hTWFwW3RoaXMudGFibGVOYW1lXTsvL2RiLmdldFNjaGVtYSgpLnRhYmxlKHRoaXMudGFibGVOYW1lKTsgXHJcbiAgICAgICAgdmFyIHF1ZXJ5ID0gdGhpcy5fcXVlcnkoZGIsdGFibGUpO1xyXG4gICAgICAgIHZhciBwayA9IHRoaXMuY29udGV4dC5kYkluc3RhbmNlLnBrW3RoaXMudGFibGVOYW1lXTtcclxuICAgICAgICB2YXIgZGsgPSB0aGlzLmNvbnRleHQuZGJJbnN0YW5jZS5vcHRpb25zW3RoaXMudGFibGVOYW1lXVsnaXNkZWxldGVkJ107IFxyXG4gICAgICAgIGlmIChkayA9PT0gdW5kZWZpbmVkKXtcclxuICAgICAgICAgICAgaWYgKGlzLmFycmF5KGlkKSlcclxuICAgICAgICAgICAgICAgIHF1ZXJ5LndoZXJlKHRhYmxlW3BrXS5pbihpZCkpO1xyXG4gICAgICAgICAgICBlbHNlIGlmIChpcy5udW1iZXIoaWQpKVxyXG4gICAgICAgICAgICAgICAgcXVlcnkud2hlcmUodGFibGVbcGtdLmVxKGlkKSk7ICAgICAgICAgICAgXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICBpZiAoaXMuYXJyYXkoaWQpKVxyXG4gICAgICAgICAgICAgICAgcXVlcnkud2hlcmUobGYub3AuYW5kKHRhYmxlW3BrXS5pbihpZCksdGFibGVbZGtdLmVxKGZhbHNlKSkpO1xyXG4gICAgICAgICAgICBlbHNlIGlmIChpcy5udW1iZXIoaWQpKVxyXG4gICAgICAgICAgICAgICAgcXVlcnkud2hlcmUobGYub3AuYW5kKHRhYmxlW3BrXS5lcShpZCksdGFibGVbZGtdLmVxKGZhbHNlKSkpO1xyXG4gICAgICAgICAgICBlbHNlIGlmIChpcy51bmRlZmluZWQoaWQpICYmICFmb3JjZVB1cmdlKSAvLyBpZCBpcyB1bmRlZmluZWRcclxuICAgICAgICAgICAgICAgIHF1ZXJ5LndoZXJlKHRhYmxlW2RrXS5lcShmYWxzZSkpO1xyXG4gICAgICAgIH0gICAgICAgIFxyXG4gICAgICAgIHJldHVybiB0aGlzLmNvbnRleHQuZXhlYyhxdWVyeSk7Ly9xdWVyeS5leGVjKCk7XHJcbiAgICB9XHJcbiAgIFxyXG4gICAgcHVibGljIHF1ZXJ5KCBjb250ZXh0OiAoY3R4OkVfQ1RYLCBxdWVyeTpEQlF1ZXJ5PFQ+KT0+YW55ICk6IFByb21pc2U8VFtdPiB7XHJcbiAgICAgICAgdmFyIGRiID0gdGhpcy5jb250ZXh0LmRiO1xyXG4gICAgICAgIHZhciB0YWJsZSA9IHRoaXMuY29udGV4dC50YWJsZVNjaGVtYU1hcFt0aGlzLnRhYmxlTmFtZV07XHJcbiAgICAgICAgdmFyIHF1ZXJ5ID0gdGhpcy5fcXVlcnkoZGIsdGFibGUpOyAgICBcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gY29udGV4dCg8RV9DVFg+dGhpcy50YmxtYXAsIFxyXG4gICAgICAgICAgICBuZXcgUXVlcnlTZXJ2aWNlPFQ+KHF1ZXJ5LHRoaXMuY29udGV4dCwgdGhpcy50YWJsZU5hbWUsIHRoaXMuZmttYXAsIHRoaXMudGJsbWFwKSk7ICAgICAgICAgICAgICAgIFxyXG5cclxuICAgIH1cclxuICAgIFxyXG4gICAgcHVibGljIGNvdW50KCBjb250ZXh0OiAoY3R4OkVfQ1RYLCBxdWVyeTpEQkNvdW50PFQ+KT0+YW55ICk6IFByb21pc2U8bnVtYmVyPiB7XHJcbiAgICAgICAgdmFyIGRiID0gdGhpcy5jb250ZXh0LmRiO1xyXG4gICAgICAgIHZhciB0YWJsZSA9IHRoaXMuY29udGV4dC50YWJsZVNjaGVtYU1hcFt0aGlzLnRhYmxlTmFtZV07ICAgICBcclxuICAgICAgICB2YXIgcGsgPSB0aGlzLmNvbnRleHQuZGJJbnN0YW5jZS5wa1t0aGlzLnRhYmxlTmFtZV07XHJcbiAgICAgICAgdmFyIHF1ZXJ5ID0gdGhpcy5fcXVlcnkoZGIsdGFibGUsIFtsZi5mbi5jb3VudCh0YWJsZVtwa10pXSk7ICAgICAgICAgICAgXHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGNvbnRleHQoPEVfQ1RYPnRoaXMudGJsbWFwLCBcclxuICAgICAgICAgICAgbmV3IENvdW50U2VydmljZTxUPihxdWVyeSx0aGlzLmNvbnRleHQsIHRoaXMudGFibGVOYW1lLCB0aGlzLmZrbWFwLCB0aGlzLnRibG1hcCkpOyAgICAgICAgICAgICAgICBcclxuXHJcbiAgICB9XHJcbiAgICBcclxuICAgIHB1YmxpYyBzZWxlY3QoIGNvbnRleHQ6IChjdHg6VF9DVFgsIHF1ZXJ5OkRCUXVlcnk8VD4pPT5hbnkgKTogUHJvbWlzZTxUW10+IHtcclxuICAgICAgICB2YXIgZGIgPSB0aGlzLmNvbnRleHQuZGI7XHJcbiAgICAgICAgdmFyIHRhYmxlID0gdGhpcy5jb250ZXh0LnRhYmxlU2NoZW1hTWFwW3RoaXMudGFibGVOYW1lXTsgICAgIFxyXG4gICAgICAgIHZhciBxdWVyeSA9IHRoaXMuX3F1ZXJ5KGRiLHRhYmxlLHVuZGVmaW5lZCxmYWxzZSk7ICAgIFxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGNvbnRleHQoPFRfQ1RYPnRoaXMudGJsbWFwW3RoaXMudGFibGVOYW1lXSwgXHJcbiAgICAgICAgICAgIG5ldyBTZWxlY3RTZXJ2aWNlPFQ+KHF1ZXJ5LHRoaXMuY29udGV4dCwgdGhpcy50YWJsZU5hbWUsIHRoaXMuZmttYXAsIHRoaXMudGJsbWFwKSk7ICAgICAgICAgICAgICAgIFxyXG5cclxuICAgIH0gICAgXHJcbiAgICAgICAgXHJcbiAgICAvLyB1c2VkIGJ5IGJvdGggZ2V0IGFuZCBxdWVyeVxyXG4gICAgcHJpdmF0ZSBfcXVlcnkoZGI6IGxmLkRhdGFiYXNlLCB0YWJsZTogbGYuc2NoZW1hLlRhYmxlLCBjb2x1bW5zPzogbGYuc2NoZW1hLkNvbHVtbltdLCBqb2luTmF2VGFibGVzPzogYm9vbGVhbikgOiBsZi5xdWVyeS5TZWxlY3RcclxuICAgIHsgICAgICAgXHJcbiAgICAgICAgaWYgKGpvaW5OYXZUYWJsZXM9PT11bmRlZmluZWQpIGpvaW5OYXZUYWJsZXM9dHJ1ZTsgXHJcbiAgICAgICAgLy8gZXhlY3V0ZSBxdWVyeSAgICAgICAgICAgIFxyXG4gICAgICAgIHZhciBxdWVyeSA9IGNvbHVtbnMgPyBkYi5zZWxlY3QoLi4uY29sdW1ucykuZnJvbSh0YWJsZSkgOiBkYi5zZWxlY3QoKS5mcm9tKHRhYmxlKTtcclxuICAgICAgICBpZiAoam9pbk5hdlRhYmxlcyl7XHJcbiAgICAgICAgICAgIGZvciAodmFyIGk9MDsgaTwgdGhpcy5qb2luLmxlbmd0aDsgaSsrKXtcclxuICAgICAgICAgICAgICAgIHF1ZXJ5LmlubmVySm9pbih0aGlzLmpvaW5baV0udGFibGUsIHRoaXMuam9pbltpXS5wcmVkaWNhdGVsZWZ0LmVxKHRoaXMuam9pbltpXS5wcmVkaWNhdGVyaWdodCkpICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHF1ZXJ5OyAgICAgICAgXHJcbiAgICAgICAgXHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vcHVibGljIHB1cmdlKCk6IFByb21pc2U8YW55PiB7XHJcbiAgICAvLyAgICByZXR1cm4gdGhpcy5kZWxldGUodW5kZWZpbmVkLCB0cnVlKTtcclxuICAgIC8vfVxyXG4gICAgcHVibGljIGRlbGV0ZShpZDogYW55LCBmb3JjZVB1cmdlPzpib29sZWFuKTogUHJvbWlzZTxhbnk+IHtcclxuICBcclxuICAgICAgICByZXR1cm4gdGhpcy5fZ2V0KGlkLCBmb3JjZVB1cmdlKS50aGVuKHJlc3VsdHM9PntcclxuXHJcbiAgICAgICAgICAgIC8vIGRpc3RpbmN0ICAtIGZsYXR0ZW4gYW5kIHJlbW92ZSBkdXBsaWNhdGVzIHJlc3VsdGluZyBmb3Igam9pbnNcclxuICAgICAgICAgICAgdmFyIG1hcCA9IHt9OyAgXHJcbiAgICAgICAgICAgIHZhciBrZXlzID0ge307ICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGZvciAodmFyIGk9MDsgaTxyZXN1bHRzLmxlbmd0aDsgaSsrKXtcclxuICAgICAgICAgICAgICAgIHZhciByZXN1bHQgPSByZXN1bHRzW2ldOyAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGZvciAodmFyIHRhYmxlIGluIHJlc3VsdCl7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIHBrID0gdGhpcy5jb250ZXh0LmRiSW5zdGFuY2UucGtbdGFibGVdO1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciByb3cgPSByZXN1bHRbdGFibGVdO1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBrZXkgPSByb3dbcGtdO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChrZXlzW3RhYmxlXT09PXVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBrZXlzW3RhYmxlXSA9IFsga2V5IF07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG1hcFt0YWJsZV0gPSBbIHJvdyBdO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGtleXNbdGFibGVdLmluZGV4T2Yoa2V5KSA9PT0gLTEpe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAga2V5c1t0YWJsZV0ucHVzaCgga2V5ICk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXBbdGFibGVdLnB1c2goIHJvdyApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBkZWxldGUgb3IgZmxhZyBkZXBlbmRpbmcgb24gc2V0dGluZ3NcclxuICAgICAgICAgICAgdmFyIGRiID0gdGhpcy5jb250ZXh0LmRiO1xyXG4gICAgICAgICAgICB2YXIgcXEgPSBbXTtcclxuICAgICAgICAgICAgZm9yICh2YXIgdGFibGVOYW1lIGluIG1hcCl7XHJcbiAgICAgICAgICAgICAgICB2YXIgcGsgPSB0aGlzLmNvbnRleHQuZGJJbnN0YW5jZS5wa1t0YWJsZU5hbWVdO1xyXG4gICAgICAgICAgICAgICAgdmFyIHRhYmxlID0gdGhpcy50YmxtYXBbdGFibGVOYW1lXTtcclxuICAgICAgICAgICAgICAgIHZhciBrZXlMaXN0ID0ga2V5c1t0YWJsZU5hbWVdO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB2YXIgZGsgPSB0aGlzLmNvbnRleHQuZGJJbnN0YW5jZS5vcHRpb25zW3RhYmxlTmFtZV1bJ2lzZGVsZXRlZCddOyBcclxuICAgICAgICAgICAgICAgIGlmIChkaz09PSB1bmRlZmluZWQgfHwgZm9yY2VQdXJnZT09PSB0cnVlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbGV0IHE9IGRiLmRlbGV0ZSgpLmZyb20odGFibGUpLndoZXJlKHRhYmxlW3BrXS5pbihrZXlMaXN0KSlcclxuICAgICAgICAgICAgICAgICAgICBxcS5wdXNoKHEpOyAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgLy9xLnB1c2goZGIuZGVsZXRlKCkuZnJvbSh0YWJsZSkud2hlcmUodGFibGVbcGtdLmluKGtleUxpc3QpKS5leGVjKCkpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgZWxzZXtcclxuICAgICAgICAgICAgICAgICAgICBsZXQgcSA9IGRiLnVwZGF0ZSh0YWJsZSkuc2V0KHRhYmxlW2RrXSx0cnVlKS53aGVyZSh0YWJsZVtwa10uaW4oa2V5TGlzdCkpXHJcbiAgICAgICAgICAgICAgICAgICAgcXEucHVzaChxKTtcclxuICAgICAgICAgICAgICAgICAgICAvL3EucHVzaChkYi51cGRhdGUodGFibGUpLnNldCh0YWJsZVtka10sdHJ1ZSkud2hlcmUodGFibGVbcGtdLmluKGtleUxpc3QpKS5leGVjKCkpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbnRleHQuZXhlY01hbnkocXEpO1xyXG4gICAgICAgICAgICAvL3JldHVybiBQcm9taXNlLmFsbChwcm9taXNlcyk7ICAgIFxyXG4gICAgICAgIH0pO1xyXG4gICAgfSAgICBcclxufVxyXG5cclxuY2xhc3MgUXVlcnlTZXJ2aWNlQmFzZTxUPiB7XHJcbiAgICBwcm90ZWN0ZWQgcXVlcnk6IGxmLnF1ZXJ5LlNlbGVjdDsgXHJcbiAgICBwcm90ZWN0ZWQgY29udGV4dDogREJDb250ZXh0SW50ZXJuYWw7XHJcbiAgICBwcm90ZWN0ZWQgdGFibGVOYW1lOiBzdHJpbmc7XHJcbiAgICBwcm90ZWN0ZWQgZmttYXA6IE9iamVjdDtcclxuICAgIHByb3RlY3RlZCB0YmxtYXA6IE9iamVjdDtcclxuICAgICAgICAgICAgXHJcbiAgICAvL3doZXJlKHByZWRpY2F0ZTogUHJlZGljYXRlKTogU2VsZWN0XHJcbiAgICBwdWJsaWMgd2hlcmUocHJlZGljYXRlOiBsZi5QcmVkaWNhdGUpOiBRdWVyeVNlcnZpY2VCYXNlPFQ+IHtcclxuICAgICAgICB2YXIgdGFibGUgPSB0aGlzLnRibG1hcFt0aGlzLnRhYmxlTmFtZV07XHJcbiAgICAgICAgdmFyIGRrID0gdGhpcy5jb250ZXh0LmRiSW5zdGFuY2Uub3B0aW9uc1t0aGlzLnRhYmxlTmFtZV1bJ2lzZGVsZXRlZCddOyBcclxuICAgICAgICBpZiAoZGsgPT09IHVuZGVmaW5lZCl7XHJcbiAgICAgICAgICAgIHRoaXMucXVlcnkud2hlcmUocHJlZGljYXRlKTsgICAgICAgICAgIFxyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5xdWVyeS53aGVyZShsZi5vcC5hbmQocHJlZGljYXRlLHRhYmxlW2RrXS5lcShmYWxzZSkpKTtcclxuICAgICAgICB9ICAgICAgICBcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH0gIFxyXG4gICAgXHJcbiAgICAvL2JpbmQoLi4udmFsdWVzOiBhbnlbXSk6IEJ1aWxkZXJcclxuICAgIFxyXG4gICAgLy9leHBsYWluKCk6IHN0cmluZ1xyXG4gICAgcHVibGljIGV4cGxhaW4oKTpzdHJpbmcge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnF1ZXJ5LmV4cGxhaW4oKTtcclxuICAgIH1cclxuICAgIC8vdG9TcWwoKTogc3RyaW5nXHJcbiAgICBwdWJsaWMgdG9TcWwoKTpzdHJpbmcge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnF1ZXJ5LnRvU3FsKCk7XHJcbiAgICB9ICAgICAgICBcclxufVxyXG5jbGFzcyBDb3VudFNlcnZpY2U8VD4gZXh0ZW5kcyBRdWVyeVNlcnZpY2VCYXNlPFQ+IGltcGxlbWVudHMgREJDb3VudDxUPiB7XHJcblxyXG4gICAgY29uc3RydWN0b3IoXHJcbiAgICAgICAgcHJvdGVjdGVkIHF1ZXJ5OiBsZi5xdWVyeS5TZWxlY3QsIFxyXG4gICAgICAgIHByb3RlY3RlZCBjb250ZXh0OiBEQkNvbnRleHRJbnRlcm5hbCxcclxuICAgICAgICBwcm90ZWN0ZWQgdGFibGVOYW1lOiBzdHJpbmcsXHJcbiAgICAgICAgcHJvdGVjdGVkIGZrbWFwOiBPYmplY3QsXHJcbiAgICAgICAgcHJvdGVjdGVkIHRibG1hcDogT2JqZWN0KXtcclxuICAgICAgICAgICAgc3VwZXIoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICBwdWJsaWMgd2hlcmUocHJlZGljYXRlOiBsZi5QcmVkaWNhdGUpOiBDb3VudFNlcnZpY2U8VD4ge1xyXG4gICAgICAgIHN1cGVyLndoZXJlKHByZWRpY2F0ZSk7ICAgICAgICBcclxuICAgICAgICByZXR1cm4gdGhpczsgXHJcbiAgICB9ICAgICAgICBcclxuICAgIHB1YmxpYyBleGVjKCkgOiBudW1iZXIgeyAgICAgICAgXHJcbiAgICAgICAgdmFyIHBrID0gdGhpcy5jb250ZXh0LmRiSW5zdGFuY2UucGtbdGhpcy50YWJsZU5hbWVdO1xyXG4gICAgICAgIHJldHVybiB0aGlzLmNvbnRleHQuZXhlYyh0aGlzLnF1ZXJ5KS50aGVuKChyZXN1bHRzKT0+eyAgICBcclxuICAgICAgICAgICAgdmFyIGNvdW50ID0gcmVzdWx0c1swXVt0aGlzLnRhYmxlTmFtZV1bYENPVU5UKCR7cGt9KWBdO1xyXG4gICAgICAgICAgICByZXR1cm4gY291bnQ7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9ICAgICAgICBcclxufVxyXG5jbGFzcyBRdWVyeVNlcnZpY2U8VD4gZXh0ZW5kcyBRdWVyeVNlcnZpY2VCYXNlPFQ+IGltcGxlbWVudHMgREJRdWVyeTxUPiB7XHJcbiAgICBcclxuICAgIGNvbnN0cnVjdG9yKFxyXG4gICAgICAgIHByb3RlY3RlZCBxdWVyeTogbGYucXVlcnkuU2VsZWN0LCBcclxuICAgICAgICBwcm90ZWN0ZWQgY29udGV4dDogREJDb250ZXh0SW50ZXJuYWwsXHJcbiAgICAgICAgcHJvdGVjdGVkIHRhYmxlTmFtZTogc3RyaW5nLFxyXG4gICAgICAgIHByb3RlY3RlZCBma21hcDogT2JqZWN0LFxyXG4gICAgICAgIHByb3RlY3RlZCB0YmxtYXA6IE9iamVjdCl7XHJcbiAgICAgICAgICAgIHN1cGVyKClcclxuICAgICAgICB9XHJcbiAgICBcclxuICAgIC8vZ3JvdXBCeSguLi5jb2x1bW5zOiBzY2hlbWEuQ29sdW1uW10pOiBTZWxlY3RcclxuICAgIFxyXG4gICAgcHVibGljIGdyb3VwQnkoLi4uY29sdW1uczogbGYuc2NoZW1hLkNvbHVtbltdKTogUXVlcnlTZXJ2aWNlPFQ+IHtcclxuICAgICAgICB0aGlzLnF1ZXJ5Lmdyb3VwQnkuYXBwbHkodGhpcyxjb2x1bW5zKTtcclxuICAgICAgICByZXR1cm4gdGhpczsgICAgICAgIFxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvL2xpbWl0KG51bWJlck9mUm93czogQmluZGVyfG51bWJlcik6IFNlbGVjdFxyXG4gICAgcHVibGljIGxpbWl0KG51bWJlck9mUm93czogbGYuQmluZGVyfG51bWJlcik6IFF1ZXJ5U2VydmljZTxUPntcclxuICAgICAgICB0aGlzLnF1ZXJ5LmxpbWl0KG51bWJlck9mUm93cyk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vb3JkZXJCeShjb2x1bW46IHNjaGVtYS5Db2x1bW4sIG9yZGVyPzogT3JkZXIpOiBTZWxlY3RcclxuICAgIHB1YmxpYyBvcmRlckJ5KGNvbHVtbjogbGYuc2NoZW1hLkNvbHVtbiwgb3JkZXI/OiBsZi5PcmRlcik6IFF1ZXJ5U2VydmljZTxUPiB7XHJcbiAgICAgICAgdGhpcy5xdWVyeS5vcmRlckJ5KGNvbHVtbiwgb3JkZXIpO1xyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG4gICAgICBcclxuICAgIC8vc2tpcChudW1iZXJPZlJvd3M6IEJpbmRlcnxudW1iZXIpOiBTZWxlY3RcclxuICAgIHB1YmxpYyBza2lwKG51bWJlck9mUm93czogbGYuQmluZGVyfG51bWJlcik6IFF1ZXJ5U2VydmljZTxUPiB7XHJcbiAgICAgICAgdGhpcy5xdWVyeS5za2lwKG51bWJlck9mUm93cyk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9XHJcbiAgICBcclxuICBcclxuICAgIHB1YmxpYyB3aGVyZShwcmVkaWNhdGU6IGxmLlByZWRpY2F0ZSk6IFF1ZXJ5U2VydmljZTxUPiB7XHJcbiAgICAgICAgc3VwZXIud2hlcmUocHJlZGljYXRlKTsgICAgICAgIFxyXG4gICAgICAgIHJldHVybiB0aGlzOyBcclxuICAgIH1cclxuXHJcbiAgICAvL2V4ZWMoKTogUHJvbWlzZTxBcnJheTxPYmplY3Q+PlxyXG4gICAgcHVibGljIGV4ZWMoKSA6IFByb21pc2U8VFtdPiB7XHJcbiAgICAgICAgLy9yZXR1cm4gdGhpcy5xdWVyeS5leGVjKCkudGhlbigocmVzdWx0cyk9PntcclxuICAgICAgICByZXR1cm4gdGhpcy5jb250ZXh0LmV4ZWModGhpcy5xdWVyeSkudGhlbigocmVzdWx0cyk9PnsgICAgXHJcbiAgICAgICAgICAgIHZhciBlbnRpdGllcyA9IHRoaXMuY29udGV4dC5jb21wb3NlKHRoaXMudGFibGVOYW1lLCByZXN1bHRzLCB0aGlzLmZrbWFwKTtcclxuICAgICAgICAgICAgcmV0dXJuIGVudGl0aWVzO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBTZWxlY3RTZXJ2aWNlPFQ+IGV4dGVuZHMgUXVlcnlTZXJ2aWNlQmFzZTxUPiBpbXBsZW1lbnRzIERCUXVlcnk8VD4ge1xyXG4gICAgXHJcbiAgICBjb25zdHJ1Y3RvcihcclxuICAgICAgICBwcm90ZWN0ZWQgcXVlcnk6IGxmLnF1ZXJ5LlNlbGVjdCwgXHJcbiAgICAgICAgcHJvdGVjdGVkIGNvbnRleHQ6IERCQ29udGV4dEludGVybmFsLFxyXG4gICAgICAgIHByb3RlY3RlZCB0YWJsZU5hbWU6IHN0cmluZyxcclxuICAgICAgICBwcm90ZWN0ZWQgZmttYXA6IE9iamVjdCxcclxuICAgICAgICBwcm90ZWN0ZWQgdGJsbWFwOiBPYmplY3Qpe1xyXG4gICAgICAgICAgICBzdXBlcigpXHJcbiAgICAgICAgfVxyXG4gICAgXHJcbiAgICAvL2dyb3VwQnkoLi4uY29sdW1uczogc2NoZW1hLkNvbHVtbltdKTogU2VsZWN0XHJcbiAgICBcclxuICAgIHB1YmxpYyBncm91cEJ5KC4uLmNvbHVtbnM6IGxmLnNjaGVtYS5Db2x1bW5bXSk6IFNlbGVjdFNlcnZpY2U8VD4ge1xyXG4gICAgICAgIHRoaXMucXVlcnkuZ3JvdXBCeS5hcHBseSh0aGlzLGNvbHVtbnMpO1xyXG4gICAgICAgIHJldHVybiB0aGlzOyAgICAgICAgXHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vbGltaXQobnVtYmVyT2ZSb3dzOiBCaW5kZXJ8bnVtYmVyKTogU2VsZWN0XHJcbiAgICBwdWJsaWMgbGltaXQobnVtYmVyT2ZSb3dzOiBsZi5CaW5kZXJ8bnVtYmVyKTogU2VsZWN0U2VydmljZTxUPntcclxuICAgICAgICB0aGlzLnF1ZXJ5LmxpbWl0KG51bWJlck9mUm93cyk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vb3JkZXJCeShjb2x1bW46IHNjaGVtYS5Db2x1bW4sIG9yZGVyPzogT3JkZXIpOiBTZWxlY3RcclxuICAgIHB1YmxpYyBvcmRlckJ5KGNvbHVtbjogbGYuc2NoZW1hLkNvbHVtbiwgb3JkZXI/OiBsZi5PcmRlcik6IFNlbGVjdFNlcnZpY2U8VD4ge1xyXG4gICAgICAgIHRoaXMucXVlcnkub3JkZXJCeShjb2x1bW4sIG9yZGVyKTtcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuICAgICAgXHJcbiAgICAvL3NraXAobnVtYmVyT2ZSb3dzOiBCaW5kZXJ8bnVtYmVyKTogU2VsZWN0XHJcbiAgICBwdWJsaWMgc2tpcChudW1iZXJPZlJvd3M6IGxmLkJpbmRlcnxudW1iZXIpOiBTZWxlY3RTZXJ2aWNlPFQ+IHtcclxuICAgICAgICB0aGlzLnF1ZXJ5LnNraXAobnVtYmVyT2ZSb3dzKTtcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuICAgIFxyXG4gIFxyXG4gICAgcHVibGljIHdoZXJlKHByZWRpY2F0ZTogbGYuUHJlZGljYXRlKTogU2VsZWN0U2VydmljZTxUPiB7XHJcbiAgICAgICAgc3VwZXIud2hlcmUocHJlZGljYXRlKTsgICAgICAgIFxyXG4gICAgICAgIHJldHVybiB0aGlzOyBcclxuICAgIH1cclxuXHJcbiAgICAvL2V4ZWMoKTogUHJvbWlzZTxBcnJheTxPYmplY3Q+PlxyXG4gICAgcHVibGljIGV4ZWMoKSA6IFByb21pc2U8VFtdPiB7XHJcbiAgICAgICAgLy9yZXR1cm4gdGhpcy5xdWVyeS5leGVjKCkudGhlbigocmVzdWx0cyk9PntcclxuICAgICAgICByZXR1cm4gdGhpcy5jb250ZXh0LmV4ZWModGhpcy5xdWVyeSkudGhlbigocmVzdWx0cyk9PnsgICAgXHJcbiAgICAgICAgICAgIHJldHVybiByZXN1bHRzO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyBnZW5lcmFsIHB1cnBvcyBoZWxwZXJzXHJcbmV4cG9ydCBjbGFzcyBpcyB7XHJcbiAgICBwdWJsaWMgc3RhdGljIGFycmF5KHg6YW55KXtcclxuICAgICAgICByZXR1cm4gQXJyYXkuaXNBcnJheSh4KTtcclxuICAgIH1cclxuICAgIHB1YmxpYyBzdGF0aWMgbnVtYmVyKHg6YW55KXtcclxuICAgICAgICByZXR1cm4gKHR5cGVvZih4KT09PSdudW1iZXInKTtcclxuICAgIH1cclxuICAgIHB1YmxpYyBzdGF0aWMgc3RyaW5nKHg6YW55KXtcclxuICAgICAgICByZXR1cm4gKHR5cGVvZih4KT09PSdzdHJpbmcnKTtcclxuICAgIH0gICAgXHJcbiAgICBwdWJsaWMgc3RhdGljIG9iamVjdCh4OmFueSl7XHJcbiAgICAgICAgcmV0dXJuICh0eXBlb2YoeCk9PT0nb2JqZWN0Jyk7XHJcbiAgICB9XHJcbiAgICBwdWJsaWMgc3RhdGljIHVuZGVmaW5lZCh4OmFueSl7XHJcbiAgICAgICAgcmV0dXJuIHggPT09IHVuZGVmaW5lZDtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIFN0cmluZ1V0aWxzIHtcclxuICAgIHB1YmxpYyBzdGF0aWMgcmVtb3ZlV2hpdGVTcGFjZShzdHI6IHN0cmluZykgOiBzdHJpbmcge1xyXG4gICAgICAgIHJldHVybiBzdHIucmVwbGFjZSgvXFxzL2csIFwiXCIpO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgUHJvbWlzZVV0aWxzIHtcclxuICAgIFxyXG4gICAgLy8gZXhlY3V0ZSBmdW5jdGlvbnMgcmV0dXJuaW5nIHByb21pc2VzIHNlcXVlbnRpYWxseVxyXG4gICAgcHVibGljIHN0YXRpYyBzZXJpYWwoLi4uaXRlbXM6IGFueVtdW10pIHtcclxuICAgICAgICBpZiAoaXRlbXMubGVuZ3RoID09PTEpIGl0ZW1zID0gaXRlbXNbMF07XHJcbiAgICAgICAgaXRlbXMucmV2ZXJzZSgpOyAvLyByZXZlcnNlIHNvIHRoYXQgcG9wcyBjb21lIG9mZiBvZiB0aGUgYm90dG9tIGluc3RlYWQgb2YgdGhlIHRvcC4gICAgXHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLHJlamVjdCk9PntcclxuICAgICAgICAgICAgX3NlcXVlbmNlKGl0ZW1zLCByZXNvbHZlLCByZWplY3QpOyAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgfSlcclxuICAgICAgICBcclxuICAgICAgICBmdW5jdGlvbiBfc2VxdWVuY2UoaXRlbXM6IGFueVtdW10sIHJlc29sdmUsIHJlamVjdCApIHtcclxuICAgICAgICAgICAgdmFyIGQgPSBpdGVtcy5wb3AoKTsgICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGQpe1xyXG4gICAgICAgICAgICAgICAgdmFyIGZuIDogKC4uLmFyZ3M6YW55W10pID0+IFByb21pc2U8YW55PiA9IGQuc3BsaWNlKDAsMSlbMF07XHJcbiAgICAgICAgICAgICAgICB2YXIgYXJncyA9IGQ7ICAgICAgICBcclxuICAgICAgICAgICAgICAgIGZuLmFwcGx5KHRoaXMsYXJncykudGhlbigoKT0+eyBfc2VxdWVuY2UoaXRlbXMsIHJlc29sdmUscmVqZWN0KTt9KVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfSAgICBcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIExvYWQge1xyXG4gICAgcHJpdmF0ZSBzdGF0aWMgY2FjaGUgPSB7fTtcclxuICAgIFxyXG4gICAgcHVibGljIHN0YXRpYyBqc29uKHVybDogc3RyaW5nLCBhc3luYz86IGJvb2xlYW4sIGNhY2hlPzpib29sZWFuKSA6IGFueSB7ICAgICAgICBcclxuXHJcbiAgICAgICAgaWYgKGNhY2hlKXtcclxuICAgICAgICAgICAgdmFyIGNhY2hlZFJlc3BvbnNlID0gdGhpcy5jYWNoZVt1cmxdO1xyXG4gICAgICAgICAgICBpZiAoY2FjaGVkUmVzcG9uc2Upe1xyXG4gICAgICAgICAgICAgICAgaWYgKGFzeW5jKXtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUscmVqZWN0KT0+e1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKEpTT04ucGFyc2UoY2FjaGVkUmVzcG9uc2UpKTtcclxuICAgICAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UoY2FjaGVkUmVzcG9uc2UpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHZhciB4bWxodHRwID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XHJcbiAgICAgICAgeG1saHR0cC5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIGlmICh4bWxodHRwLnJlYWR5U3RhdGUgPT0gNCkge1xyXG4gICAgICAgICAgICAgICAgaWYgKGFzeW5jKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHhtbGh0dHAuc3RhdHVzID09IDIwMCl7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2FjaGUpIHRoaXMuY2FjaGVbdXJsXSA9IHhtbGh0dHAucmVzcG9uc2VUZXh0O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUscmVqZWN0KT0+e1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShKU09OLnBhcnNlKGNhY2hlZFJlc3BvbnNlKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pOyAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLHJlamVjdCk9PntcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdCh4bWxodHRwLnN0YXR1cyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pOyAgICBcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIFxyXG4gICAgICAgIHhtbGh0dHAub3BlbihcIkdFVFwiLCB1cmwsIGFzeW5jKTtcclxuICAgICAgICB4bWxodHRwLnNlbmQoKTtcclxuICAgICAgICBpZiAoIWFzeW5jKXtcclxuICAgICAgICAgICAgaWYgKHhtbGh0dHAuc3RhdHVzID09IDIwMCl7XHJcbiAgICAgICAgICAgICAgICBpZiAoY2FjaGUpIHRoaXMuY2FjaGVbdXJsXSA9IHhtbGh0dHAucmVzcG9uc2VUZXh0O1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UoeG1saHR0cC5yZXNwb25zZVRleHQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2V7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4geG1saHR0cC5zdGF0dXM7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9ICAgIFxyXG59Il0sInNvdXJjZVJvb3QiOiIvc291cmNlLyJ9
