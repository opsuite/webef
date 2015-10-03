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
var webef;
(function (webef) {
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
    webef.DBSchema = DBSchema;
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
    webef.DBContext = DBContext;
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
    webef.is = is;
    var StringUtils = (function () {
        function StringUtils() {
        }
        StringUtils.removeWhiteSpace = function (str) {
            return str.replace(/\s/g, "");
        };
        return StringUtils;
    })();
    webef.StringUtils = StringUtils;
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
    webef.PromiseUtils = PromiseUtils;
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
    webef.Load = Load;
})(webef || (webef = {}));
module.exports = webef;

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImVmLnRzIl0sIm5hbWVzIjpbIndlYmVmIiwid2ViZWYuREJTY2hlbWEiLCJ3ZWJlZi5EQlNjaGVtYS5jb25zdHJ1Y3RvciIsIndlYmVmLkRCU2NoZW1hLmNyZWF0ZSIsIndlYmVmLkRCU2NoZW1hSW50ZXJuYWwiLCJ3ZWJlZi5EQlNjaGVtYUludGVybmFsLmNvbnN0cnVjdG9yIiwid2ViZWYuREJJbnN0YW5jZSIsIndlYmVmLkRCSW5zdGFuY2UuY29uc3RydWN0b3IiLCJ3ZWJlZi5EQkluc3RhbmNlLm5ld1RhYmxlTWFwIiwid2ViZWYuREJDb250ZXh0Iiwid2ViZWYuREJDb250ZXh0LmNvbnN0cnVjdG9yIiwid2ViZWYuREJDb250ZXh0LnB1cmdlIiwid2ViZWYuREJDb250ZXh0LnRyYW5zYWN0aW9uIiwid2ViZWYuREJDb250ZXh0LnRhYmxlcyIsIndlYmVmLkRCQ29udGV4dC5zZWxlY3QiLCJ3ZWJlZi5EQkNvbnRleHQuZ2V0Q2hlY2twb2ludCIsIndlYmVmLkRCQ29udGV4dC5EQkVudGl0eSIsIndlYmVmLkRCQ29udGV4dEludGVybmFsIiwid2ViZWYuREJDb250ZXh0SW50ZXJuYWwuY29uc3RydWN0b3IiLCJ3ZWJlZi5EQkNvbnRleHRJbnRlcm5hbC5jb21wb3NlIiwid2ViZWYuREJDb250ZXh0SW50ZXJuYWwuY29tcG9zZV8iLCJ3ZWJlZi5EQkNvbnRleHRJbnRlcm5hbC5kZWNvbXBvc2UiLCJ3ZWJlZi5EQkNvbnRleHRJbnRlcm5hbC5kZWNvbXBvc2VfIiwid2ViZWYuREJDb250ZXh0SW50ZXJuYWwuYWxsb2NhdGVLZXlzIiwid2ViZWYuREJDb250ZXh0SW50ZXJuYWwucm9sbGJhY2tLZXlzIiwid2ViZWYuREJDb250ZXh0SW50ZXJuYWwucHVyZ2VLZXlzIiwid2ViZWYuREJDb250ZXh0SW50ZXJuYWwuZXhlYyIsIndlYmVmLkRCQ29udGV4dEludGVybmFsLmV4ZWNNYW55Iiwid2ViZWYuREJDb250ZXh0SW50ZXJuYWwuX2V4ZWNNYW55Iiwid2ViZWYuREJFbnRpdHlJbnRlcm5hbCIsIndlYmVmLkRCRW50aXR5SW50ZXJuYWwuY29uc3RydWN0b3IiLCJ3ZWJlZi5EQkVudGl0eUludGVybmFsLnB1dCIsIndlYmVmLkRCRW50aXR5SW50ZXJuYWwucHV0X2NhbGN1bGF0ZUZvcmVpZ25LZXlzIiwid2ViZWYuREJFbnRpdHlJbnRlcm5hbC5wdXRfY2FsY3VsYXRlRm9yZWlnbktleXMuY2FsY3VsYXRlRm9yZWlnbktleXMiLCJ3ZWJlZi5EQkVudGl0eUludGVybmFsLnB1dF9jYWxjdWxhdGVLZXlzIiwid2ViZWYuREJFbnRpdHlJbnRlcm5hbC5wdXRfZXhlY3V0ZSIsIndlYmVmLkRCRW50aXR5SW50ZXJuYWwuZ2V0Iiwid2ViZWYuREJFbnRpdHlJbnRlcm5hbC5fZ2V0Iiwid2ViZWYuREJFbnRpdHlJbnRlcm5hbC5xdWVyeSIsIndlYmVmLkRCRW50aXR5SW50ZXJuYWwuY291bnQiLCJ3ZWJlZi5EQkVudGl0eUludGVybmFsLnNlbGVjdCIsIndlYmVmLkRCRW50aXR5SW50ZXJuYWwuX3F1ZXJ5Iiwid2ViZWYuREJFbnRpdHlJbnRlcm5hbC5kZWxldGUiLCJ3ZWJlZi5RdWVyeVNlcnZpY2VCYXNlIiwid2ViZWYuUXVlcnlTZXJ2aWNlQmFzZS5jb25zdHJ1Y3RvciIsIndlYmVmLlF1ZXJ5U2VydmljZUJhc2Uud2hlcmUiLCJ3ZWJlZi5RdWVyeVNlcnZpY2VCYXNlLmV4cGxhaW4iLCJ3ZWJlZi5RdWVyeVNlcnZpY2VCYXNlLnRvU3FsIiwid2ViZWYuQ291bnRTZXJ2aWNlIiwid2ViZWYuQ291bnRTZXJ2aWNlLmNvbnN0cnVjdG9yIiwid2ViZWYuQ291bnRTZXJ2aWNlLndoZXJlIiwid2ViZWYuQ291bnRTZXJ2aWNlLmV4ZWMiLCJ3ZWJlZi5RdWVyeVNlcnZpY2UiLCJ3ZWJlZi5RdWVyeVNlcnZpY2UuY29uc3RydWN0b3IiLCJ3ZWJlZi5RdWVyeVNlcnZpY2UuZ3JvdXBCeSIsIndlYmVmLlF1ZXJ5U2VydmljZS5saW1pdCIsIndlYmVmLlF1ZXJ5U2VydmljZS5vcmRlckJ5Iiwid2ViZWYuUXVlcnlTZXJ2aWNlLnNraXAiLCJ3ZWJlZi5RdWVyeVNlcnZpY2Uud2hlcmUiLCJ3ZWJlZi5RdWVyeVNlcnZpY2UuZXhlYyIsIndlYmVmLlNlbGVjdFNlcnZpY2UiLCJ3ZWJlZi5TZWxlY3RTZXJ2aWNlLmNvbnN0cnVjdG9yIiwid2ViZWYuU2VsZWN0U2VydmljZS5ncm91cEJ5Iiwid2ViZWYuU2VsZWN0U2VydmljZS5saW1pdCIsIndlYmVmLlNlbGVjdFNlcnZpY2Uub3JkZXJCeSIsIndlYmVmLlNlbGVjdFNlcnZpY2Uuc2tpcCIsIndlYmVmLlNlbGVjdFNlcnZpY2Uud2hlcmUiLCJ3ZWJlZi5TZWxlY3RTZXJ2aWNlLmV4ZWMiLCJ3ZWJlZi5pcyIsIndlYmVmLmlzLmNvbnN0cnVjdG9yIiwid2ViZWYuaXMuYXJyYXkiLCJ3ZWJlZi5pcy5udW1iZXIiLCJ3ZWJlZi5pcy5zdHJpbmciLCJ3ZWJlZi5pcy5vYmplY3QiLCJ3ZWJlZi5pcy51bmRlZmluZWQiLCJ3ZWJlZi5TdHJpbmdVdGlscyIsIndlYmVmLlN0cmluZ1V0aWxzLmNvbnN0cnVjdG9yIiwid2ViZWYuU3RyaW5nVXRpbHMucmVtb3ZlV2hpdGVTcGFjZSIsIndlYmVmLlByb21pc2VVdGlscyIsIndlYmVmLlByb21pc2VVdGlscy5jb25zdHJ1Y3RvciIsIndlYmVmLlByb21pc2VVdGlscy5zZXJpYWwiLCJ3ZWJlZi5Qcm9taXNlVXRpbHMuc2VyaWFsLl9zZXF1ZW5jZSIsIndlYmVmLkxvYWQiLCJ3ZWJlZi5Mb2FkLmNvbnN0cnVjdG9yIiwid2ViZWYuTG9hZC5qc29uIl0sIm1hcHBpbmdzIjoiQUFBQTs7OzsrRUFJK0U7Ozs7OztBQUUvRSw0Q0FBNEM7QUFDNUMsUUFBTyxrQkFBa0IsQ0FBQyxDQUFBO0FBRTFCLElBQU8sS0FBSyxDQXFuQ1g7QUFybkNELFdBQU8sS0FBSyxFQUFDLENBQUM7SUFnQ1ZBO1FBQUFDO1FBcUpBQyxDQUFDQTtRQWxKaUJELGVBQU1BLEdBQXBCQTtZQUFzQkUsY0FBY0E7aUJBQWRBLFdBQWNB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Q0EsTUFBTUEsQ0FBQ0EsS0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQUEsQ0FBQ0E7d0JBQzdCQSxFQUFFQSxDQUFDQSxTQUFTQSxDQUFDQSxNQUFNQSxFQUFFQSxFQUFFQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFBQTt3QkFDckNBLE1BQU1BLEdBQUNBLElBQUlBLENBQUNBO3dCQUNaQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFBQTt3QkFDbEJBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBO29CQUN2QkEsQ0FBQ0E7b0JBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUFBLENBQUNBO3dCQUN0Q0EsRUFBRUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsRUFBRUEsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQUE7b0JBQ3hDQSxDQUFDQTtvQkFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQUEsQ0FBQ0E7d0JBQ2xDQSxFQUFFQSxDQUFDQSxTQUFTQSxDQUFDQSxNQUFNQSxFQUFFQSxFQUFFQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFBQTtvQkFDM0NBLENBQUNBO29CQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxDQUFDQSxLQUFHQSxDQUFDQSxDQUFDQSxDQUFBQSxDQUFDQTt3QkFDckNBLEVBQUVBLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLEVBQUVBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUFBO29CQUN6Q0EsQ0FBQ0E7b0JBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEtBQUdBLENBQUNBLENBQUNBLENBQUFBLENBQUNBO3dCQUNqQ0EsRUFBRUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsRUFBRUEsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQUE7b0JBQ3pDQSxDQUFDQTtvQkFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQUEsQ0FBQ0E7d0JBQ25DQSxFQUFFQSxDQUFDQSxTQUFTQSxDQUFDQSxNQUFNQSxFQUFFQSxFQUFFQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFBQTtvQkFDeENBLENBQUNBO29CQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFHQSxDQUFDQSxDQUFDQSxDQUFBQSxDQUFDQTt3QkFDcENBLEVBQUVBLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLEVBQUVBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUFBO29CQUN4Q0EsQ0FBQ0E7b0JBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLEtBQUdBLENBQUNBLENBQUNBLENBQUFBLENBQUNBO3dCQUNuQ0EsRUFBRUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsRUFBRUEsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQUE7b0JBQzlDQSxDQUFDQTtvQkFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQUEsQ0FBQ0E7d0JBQ2xDQSxFQUFFQSxDQUFDQSxTQUFTQSxDQUFDQSxNQUFNQSxFQUFFQSxFQUFFQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFBQTt3QkFDckNBLFNBQVNBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO3dCQUV2QkEsSUFBSUEsQ0FBQ0EsR0FBRUEsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7d0JBQ3hDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQTs0QkFDaEJBLFVBQVVBLEVBQUVBLE1BQU1BOzRCQUNsQkEsT0FBT0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7NEJBQ2JBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3lCQUNqQkEsQ0FBQUE7b0JBZUxBLENBQUNBO29CQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFFQSxDQUFDQSxDQUFDQSxDQUFBQSxDQUFDQTt3QkFDbENBLFFBQVFBLEdBQUdBLEtBQUtBLENBQUNBO3dCQUNqQkEsSUFBSUEsQ0FBQ0EsR0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7d0JBQ3ZDQSxJQUFJQSxDQUFDQSxHQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTt3QkFFdEJBLElBQUlBLFNBQVNBLEdBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUNuQkEsSUFBSUEsT0FBT0EsR0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JB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LENBQUNBO29CQUN6QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQUEsQ0FBQ0E7d0JBQ2pCQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFDQSxDQUFDQTs0QkFDL0JBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBOzRCQUNsQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7d0JBQ2xEQSxDQUFDQTtvQkFDTEEsQ0FBQ0E7b0JBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUFBLENBQUNBO3dCQUN2QkEsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7d0JBQy9CQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxHQUFHQSxDQUFDQSxTQUFTQSxFQUFFQSxLQUFLQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtvQkFDL0NBLENBQUNBO2dCQUNMQSxDQUFDQTtZQUNMQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVNTCx3Q0FBWUEsR0FBbkJBLFVBQW9CQSxLQUFZQSxFQUFFQSxJQUFZQTtZQUMxQ00sSUFBSUEsR0FBR0EsR0FBR0EsS0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsV0FBV0EsU0FBSUEsS0FBS0EsaUJBQWNBLENBQUNB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QUFVQSxDQUFDQSxFQUFFQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtZQUMzQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsSUFBSUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7Z0JBQ3hCQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLENBQUNBLElBQUlBLENBQUVBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1lBQzVEQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFDQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBO2dCQUM3Q0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMvQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7WUFFakNBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLEVBQUVBLENBQUNBO1lBQ2hCQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFDQSxDQUFDQTtnQkFFckNBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUMvQkEsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7Z0JBRWxEQSx3REFBd0RBO2dCQUN4REEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0Es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SUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7b0JBQzFEQSxJQUFJQSxlQUFlQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtvQkFDeERBLElBQUlBLEtBQUtBLEdBQUdBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLENBQUNBO29CQUN6QkEsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0E7b0JBQ2hCQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFBQSxDQUFDQTt3QkFDakJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUNBLENBQUNBLEVBQUVBLENBQUNBLEdBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUNBLENBQUNBOzRCQUMvQkEsb0JBQW9CQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFDQSxNQUFNQSxFQUFFQSxTQUFTQSxFQUFFQSxlQUFlQSxFQUFFQSxHQUFHQSxDQUFDQSxTQUFTQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQTs0QkFDeEZBLElBQUlBLENBQUNBLHdCQUF3QkEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7d0JBQzFFQSxDQUFDQTtvQkFDTEEsQ0FBQ0E7b0JBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUFBLENBQUNBO3dCQUN2QkEsb0JBQW9CQSxDQUFDQSxLQUFLQSxFQUFDQSxNQUFNQSxFQUFFQSxTQUFTQSxFQUFFQSxlQUFlQSxFQUFFQSxHQUFH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LFNBQVNBLENBQUNBLENBQUNBLENBQUFBLHdDQUF3Q0E7WUFDaEdBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLEVBQUVBLEVBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBQ2xDQSxJQUFJQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxFQUFFQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtZQUNwREEsSUFBSUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7WUFDdEVBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLFNBQVNBLENBQUNBLENBQUFBLENBQUNBO2dCQUNsQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7b0JBQ2JBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO2dCQUNsQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7b0JBQ25CQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0Q0EsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ0ZBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO29CQUNiQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDakVBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLE1BQU1BLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO29CQUNuQkEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pFQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxTQUFTQSxDQUFDQSxFQUFFQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQTtvQkFDckNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1lBQ3pDQSxDQUFDQTtZQUNEQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFBQSxlQUFlQTtRQUNuREEsQ0FBQ0E7UUFFTVIsZ0NBQUtBLEdBQVpBLFVBQWNBLE9BQTJDQTtZQUNyRFMsSUFBSUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDekJBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGNBQWNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1lBQ3hEQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxFQUFFQSxFQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUVsQ0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBUUEsSUFBSUEsQ0FBQ0EsTUFBTUEsRUFDN0JBLElBQUlBLFlBQVlBLENBQUlBLEtBQUtBLEVBQUNBLElBQUlBLENBQUNBLE9BQU9BLEVBQUVBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1FBRTFGQSxDQUFDQTtRQUVNVCxnQ0FBS0EsR0FBWkEsVUFBY0EsT0FBMkNBO1lBQ3JEVSxJQUFJQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxFQUFFQSxDQUFDQTtZQUN6QkEsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsY0FBY0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7WUFDeERBLElBQUlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1lBQ3BEQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxFQUFFQSxFQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUU1REEsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBUUEsSUFBSUEsQ0FBQ0EsTUFBTUEsRUFDN0JBLElBQUlBLFlBQVlBLENBQUlBLEtBQUtBLEVBQUNBLElBQUlBLENBQUNBLE9BQU9BLEVBQUVBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtB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QSxFQUFFQSxFQUFDQSxDQUFDQTtvQkFDakNBLElBQUlBLE1BQU1BLEdBQUdBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUN4QkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsS0FBS0EsSUFBSUEsTUFBTUEsQ0FBQ0EsQ0FBQUEsQ0FBQ0E7d0JBQ3RCQSxJQUFJQSxFQUFFQSxHQUFHQSxLQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTt3QkFDM0NBLElBQUlBLEdBQUdBLEdBQUdBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO3dCQUN4QkEsSUFBSUEsR0FBR0EsR0FBR0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7d0JBRWxCQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFHQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTs0QkFDMUJBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUVBLEdBQUdBLENBQUVBLENBQUNBOzRCQUN0QkEsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBRUEsR0FBR0EsQ0FBRUEsQ0FBQ0E7d0JBQ3pCQSxDQUFDQTt3QkFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7NEJBQ0ZBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUFBLENBQUNBO2dDQUNqQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBRUEsR0FBR0EsQ0FBRUEsQ0FBQ0E7Z0NBQ3hCQSxHQUFHQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFFQSxHQUFHQSxDQUFFQSxDQUFDQTs0QkFDM0JBLENBQUNBO3dCQUNMQSxDQUFDQTtvQkFDTEEsQ0FBQ0E7Z0JBQ0xBLENBQUNB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WUEsVUFBSUEsT0FxRGhCQSxDQUFBQTtBQUNMQSxDQUFDQSxFQXJuQ00sS0FBSyxLQUFMLEtBQUssUUFxbkNYO0FBQ0QsaUJBQVMsS0FBSyxDQUFDIiwiZmlsZSI6ImVmLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG58IENvcHlyaWdodCAoYykgMjAxNSwgUG9zaXRpdmUgVGVjaG5vbG9neVxyXG58IERpc3RyaWJ1dGVkIHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgTUlUIExpY2Vuc2UuXHJcbnwgVGhlIGZ1bGwgbGljZW5zZSBpcyBpbiB0aGUgZmlsZSBMSUNFTlNFLCBkaXN0cmlidXRlZCB3aXRoIHRoaXMgc29mdHdhcmUuXHJcbnwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cclxuXHJcbi8vLyA8cmVmZXJlbmNlIHBhdGg9XCIuLi90eXBpbmdzL3RzZC5kLnRzXCIgLz5cclxuaW1wb3J0ICdnb29nbGUvbG92ZWZpZWxkJztcclxuXHJcbm1vZHVsZSB3ZWJlZiB7XHJcbiAgICAvLyBleHBvcnRzXHJcbiAgICBleHBvcnQgaW50ZXJmYWNlIERCRW50aXR5PFQsIEVfQ1RYLCBUX0NUWD4ge1xyXG4gICAgICAgIHB1dChlbnRpdHk6IFQpOiBQcm9taXNlPG51bWJlcj47XHJcbiAgICAgICAgcHV0KGVudGl0aWVzOiBUW10pOiBQcm9taXNlPG51bWJlcltdPjtcclxuICAgICAgICBnZXQoaWQ6IG51bWJlcik6IFByb21pc2U8VD47XHJcbiAgICAgICAgZ2V0KGlkPzogbnVtYmVyW10pOiBQcm9taXNlPFRbXT47XHJcbiAgICAgICAgZGVsZXRlKGlkOiBudW1iZXIpOiBQcm9taXNlPFQ+O1xyXG4gICAgICAgIGRlbGV0ZShpZD86IG51bWJlcltdKTogUHJvbWlzZTxUW10+O1xyXG4gICAgICAgIHF1ZXJ5KCBmbjogKGNvbnRleHQ6RV9DVFgsIHF1ZXJ5OkRCUXVlcnk8VD4pPT5hbnkpOiBQcm9taXNlPFRbXT47XHJcbiAgICAgICAgY291bnQoIGZuOiAoY29udGV4dDpFX0NUWCwgcXVlcnk6REJDb3VudDxUPik9PmFueSk6IFByb21pc2U8bnVtYmVyPjtcclxuICAgICAgICBzZWxlY3QoIGZuOiAoY29udGV4dDpUX0NUWCwgcXVlcnk6REJRdWVyeTxUPik9PmFueSk6IFByb21pc2U8VFtdPjtcclxuICAgIH1cclxuICAgIGV4cG9ydCBpbnRlcmZhY2UgREJRdWVyeTxUPiB7XHJcbiAgICAgICAgZ3JvdXBCeSguLi5jb2x1bW5zOiBsZi5zY2hlbWEuQ29sdW1uW10pOiBEQlF1ZXJ5PFQ+XHJcbiAgICAgICAgbGltaXQobnVtYmVyT2ZSb3dzOiBsZi5CaW5kZXJ8bnVtYmVyKTogREJRdWVyeTxUPlxyXG4gICAgICAgIG9yZGVyQnkoY29sdW1uOiBsZi5zY2hlbWEuQ29sdW1uLCBvcmRlcj86IGxmLk9yZGVyKTogREJRdWVyeTxUPlxyXG4gICAgICAgIHNraXAobnVtYmVyT2ZSb3dzOiBsZi5CaW5kZXJ8bnVtYmVyKTogREJRdWVyeTxUPlxyXG4gICAgICAgIHdoZXJlKHByZWRpY2F0ZTogbGYuUHJlZGljYXRlKTogREJRdWVyeTxUPlxyXG4gICAgICAgIGV4cGxhaW4oKTpzdHJpbmdcclxuICAgICAgICB0b1NxbCgpOnN0cmluZ1xyXG4gICAgICAgIGV4ZWMoKSA6IFByb21pc2U8VFtdPlxyXG4gICAgfVxyXG4gICAgZXhwb3J0IGludGVyZmFjZSBEQkNvdW50PFQ+IHtcclxuICAgICAgICB3aGVyZShwcmVkaWNhdGU6IGxmLlByZWRpY2F0ZSk6IERCQ291bnQ8VD5cclxuICAgICAgICBleHBsYWluKCk6c3RyaW5nXHJcbiAgICAgICAgdG9TcWwoKTpzdHJpbmdcclxuICAgICAgICBleGVjKCk6bnVtYmVyO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpbnRlcmZhY2UgREJNb2RlbCB7fVxyXG4gICAgXHJcbiAgICBleHBvcnQgY2xhc3MgREJTY2hlbWEge1xyXG4gICAgICAgIHB1YmxpYyBzdGF0aWMgY3JlYXRlIChkYk5hbWU6IHN0cmluZywgZGJWZXJzaW9uOiBudW1iZXIsIHNjaGVtYTogT2JqZWN0KTogdm9pZDtcclxuICAgICAgICBwdWJsaWMgc3RhdGljIGNyZWF0ZSAoanNvbkZpbGVQYXRoOnN0cmluZyk6IHZvaWQ7ICAgICBcclxuICAgICAgICBwdWJsaWMgc3RhdGljIGNyZWF0ZSAoLi4uYXJnczogYW55W10pOiB2b2lkIHsgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBkYk5hbWU6c3RyaW5nLCBcclxuICAgICAgICAgICAgICAgIGRiVmVyc2lvbjpudW1iZXIsIFxyXG4gICAgICAgICAgICAgICAgc2NoZW1hOiBPYmplY3Q7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGFyZ3MubGVuZ3RoID09PSAzKXtcclxuICAgICAgICAgICAgICAgIGRiTmFtZSA9IGFyZ3NbMF07XHJcbiAgICAgICAgICAgICAgICBkYlZlcnNpb24gPSBhcmdzWzFdO1xyXG4gICAgICAgICAgICAgICAgc2NoZW1hID0gYXJnc1syXVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKGFyZ3MubGVuZ3RoID09PSAxKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgZGF0YSA9IExvYWQuanNvbihhcmdzWzBdKTtcclxuICAgICAgICAgICAgICAgIGRiTmFtZSA9IGRhdGEubmFtZTtcclxuICAgICAgICAgICAgICAgIGRiVmVyc2lvbiA9IGRhdGEudmVyc2lvbjtcclxuICAgICAgICAgICAgICAgIHNjaGVtYSA9IGRhdGEuc2NoZW1hO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBzY2hlbWFCdWlsZGVyID0gbGYuc2NoZW1hLmNyZWF0ZShkYk5hbWUsIGRiVmVyc2lvbik7ICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGNvbHVtbnM6YW55ID0ge307XHJcbiAgICAgICAgICAgIHZhciBuYXY6YW55ID0ge307XHJcbiAgICAgICAgICAgIHZhciBmazphbnkgPSB7fTtcclxuICAgICAgICAgICAgdmFyIHBrOmFueSA9IHt9O1xyXG4gICAgICAgICAgICB2YXIgdGFibGVzOnN0cmluZ1tdID0gW107XHJcbiAgICAgICAgICAgIHZhciBvcHRpb25zOmFueSA9IHt9O1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZm9yICh2YXIgdGFibGUgaW4gc2NoZW1hKXtcclxuICAgICAgICAgICAgICAgIHZhciB0YWJsZVNjaGVtYSA9IHNjaGVtYVt0YWJsZV07XHJcbiAgICAgICAgICAgICAgICB2YXIgdGIgPXNjaGVtYUJ1aWxkZXIuY3JlYXRlVGFibGUodGFibGUpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB0YWJsZXMucHVzaCh0YWJsZSk7ICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB2YXIgbnVsbGFibGVzID0gW107XHJcbiAgICAgICAgICAgICAgICB2YXIgaW5kZWNlcyA9IFtdO1xyXG4gICAgICAgICAgICAgICAgY29sdW1uc1t0YWJsZV0gPSBbXTtcclxuICAgICAgICAgICAgICAgIG5hdlt0YWJsZV0gPSB7fTtcclxuICAgICAgICAgICAgICAgIGZrW3RhYmxlXSA9IHt9ICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIG9wdGlvbnNbdGFibGVdID0ge307XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBwa2V5cyA6IHN0cmluZ1tdID0gW107XHJcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBjb2x1bW4gaW4gdGFibGVTY2hlbWEpe1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciB0eXBlRGVmID0gU3RyaW5nVXRpbHMucmVtb3ZlV2hpdGVTcGFjZSh0YWJsZVNjaGVtYVtjb2x1bW5dKTtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgaXNDb2x1bW4gPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBpc1BrZXkgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZURlZi5pbmRleE9mKCdwa2V5Jyk9PT0wKXtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGIuYWRkQ29sdW1uKGNvbHVtbiwgbGYuVHlwZS5JTlRFR0VSKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpc1BrZXk9dHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcGtleXMucHVzaChjb2x1bW4pXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHBrW3RhYmxlXSA9IGNvbHVtbjtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAodHlwZURlZi5pbmRleE9mKCdzdHJpbmcnKSA9PT0gMCl7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRiLmFkZENvbHVtbihjb2x1bW4sIGxmLlR5cGUuU1RSSU5HKVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBlbHNlIGlmICh0eXBlRGVmLmluZGV4T2YoJ2RhdGUnKT09PTApe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0Yi5hZGRDb2x1bW4oY29sdW1uLCBsZi5UeXBlLkRBVEVfVElNRSlcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAodHlwZURlZi5pbmRleE9mKCdib29sZWFuJyk9PT0wKXtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGIuYWRkQ29sdW1uKGNvbHVtbiwgbGYuVHlwZS5CT09MRUFOKVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBlbHNlIGlmICh0eXBlRGVmLmluZGV4T2YoJ2ludCcpPT09MCl7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRiLmFkZENvbHVtbihjb2x1bW4sIGxmLlR5cGUuSU5URUdFUilcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAodHlwZURlZi5pbmRleE9mKCdmbG9hdCcpPT09MCl7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRiLmFkZENvbHVtbihjb2x1bW4sIGxmLlR5cGUuTlVNQkVSKVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBlbHNlIGlmICh0eXBlRGVmLmluZGV4T2YoJ29iamVjdCcpPT09MCl7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRiLmFkZENvbHVtbihjb2x1bW4sIGxmLlR5cGUuT0JKRUNUKVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBlbHNlIGlmICh0eXBlRGVmLmluZGV4T2YoJ2FycmF5Jyk9PT0wKXtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGIuYWRkQ29sdW1uKGNvbHVtbiwgbGYuVHlwZS5BUlJBWV9CVUZGRVIpXHJcbiAgICAgICAgICAgICAgICAgICAgfSAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBlbHNlIGlmICh0eXBlRGVmLmluZGV4T2YoJ2ZrZXknKT09PTApe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0Yi5hZGRDb2x1bW4oY29sdW1uLCBsZi5UeXBlLklOVEVHRVIpICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBudWxsYWJsZXMucHVzaChjb2x1bW4pOyAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHggPXR5cGVEZWYuc3BsaXQoJzonKVsxXS5zcGxpdCgnLicpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBma1t0YWJsZV1bY29sdW1uXSA9IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbHVtbk5hbWU6IGNvbHVtbixcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZrVGFibGU6IHhbMF0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBma0NvbHVtbjogeFsxXVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvKiBma2V5cyBjdXJyZW50bHkgZGlzYWJsZWQgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBiZWNhdXNlIGEgYnVnIGluIGVudGl0eS5wdXQoKSBleGVjdXRlcyBxdWVyaWVzXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbiBwYXJhbGVsbCBpbnN0ZWFkIG9mIGluIHNlcmllcy5cclxuICAgICAgICAgICAgICAgICAgICAgICAgKi9cclxuICAgICAgICAgICAgICAgICAgICAgICAgLypcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGIuYWRkRm9yZWlnbktleShgZmtfJHtjb2x1bW59YCwge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbG9jYWw6IGNvbHVtbixcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlZjogYCR7eFswXX0uJHt4WzFdfWAsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhY3Rpb246IGxmLkNvbnN0cmFpbnRBY3Rpb24uUkVTVFJJQ1QsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aW1pbmc6IGxmLkNvbnN0cmFpbnRUaW1pbmcuREVGRVJSQUJMRVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgKi9cclxuICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKHR5cGVEZWYuaW5kZXhPZignbmF2LT4nKT09MCl7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzQ29sdW1uID0gZmFsc2U7ICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHg9dHlwZURlZi5zcGxpdCgnPicpWzFdLnNwbGl0KCc6Jyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciB5PXhbMV0uc3BsaXQoJy4nKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciB0YWJsZU5hbWU9eFswXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGZrVGFibGU9eVswXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGZrQ29sdW1uPXlbMV07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBuYXZbdGFibGVdW2NvbHVtbl0gPSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbHVtbk5hbWU6IGNvbHVtbixcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGFibGVOYW1lOiB0YWJsZU5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZrVGFibGU6IGZrVGFibGUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZrQ29sdW1uOiBma0NvbHVtbixcclxuICAgICAgICAgICAgICAgICAgICAgICAgaXNBcnJheTogKGZrVGFibGUgPT09IHRhYmxlTmFtZSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAodHlwZURlZi5pbmRleE9mKCdkYnRpbWVzdGFtcCcpPT09MCl7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRiLmFkZENvbHVtbihjb2x1bW4sIGxmLlR5cGUuSU5URUdFUilcclxuICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9uc1t0YWJsZV1bJ2RidGltZXN0YW1wJ10gPSBjb2x1bW47XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKHR5cGVEZWYuaW5kZXhPZignaXNkZWxldGVkJyk9PT0wKXtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGIuYWRkQ29sdW1uKGNvbHVtbiwgbGYuVHlwZS5CT09MRUFOKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9uc1t0YWJsZV1bJ2lzZGVsZXRlZCddID0gY29sdW1uO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBpZiAoaXNDb2x1bW4pIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGFkZCBpbmRlY2VzIGFuZCB1bmlxdWUgY29uc3RyYWludHMgaWYgcmVxdWVzdGVkXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBvcHMgPSB0eXBlRGVmLnNwbGl0KCcsJylcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG9wcy5pbmRleE9mKCdpbmRleCcpICE9PSAtMSl7ICAgICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciB1bmlxdWUgPSAob3BzLmluZGV4T2YoJ3VuaXF1ZScpICE9PSAtMSk7ICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5kZWNlcy5wdXNoKGNvbHVtbik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG9wcy5pbmRleE9mKCdudWxsJykgIT09IC0xKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbnVsbGFibGVzLnB1c2goY29sdW1uKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29sdW1uc1t0YWJsZV0ucHVzaChjb2x1bW4pO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGlmIChwa2V5cy5sZW5ndGggPT09MCkgdGhyb3cgYFNjaGVtYSBFcnJvcjogbm8gcHJpbWFyeSBrZXkgd2FzIHNwZWNpZmllZCBmb3IgdGFibGUgJyR7dGFibGV9J2A7XHJcbiAgICAgICAgICAgICAgICBpZiAocGtleXMubGVuZ3RoID4gMSkgdGhyb3cgYFNjaGVtYSBFcnJvcjogbW9yZSB0aGFuIG9uZSBwcmltYXJ5IGtleSB3YXMgc3BlY2lmaWVkIGZvciB0YWJsZSAnJHt0YWJsZX0nYDtcclxuICAgICAgICAgICAgICAgIHRiLmFkZFByaW1hcnlLZXkocGtleXMpOyBcclxuICAgICAgICAgICAgICAgIHRiLmFkZE51bGxhYmxlKG51bGxhYmxlcyk7XHJcbiAgICAgICAgICAgICAgICB0Yi5hZGRJbmRleChgaXhfJHt0YWJsZX1gLCBpbmRlY2VzKTsgXHJcbiAgICAgICAgICAgIH0gICAgICBcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIERCU2NoZW1hSW50ZXJuYWwuaW5zdGFuY2VNYXBbZGJOYW1lXSA9IFxyXG4gICAgICAgICAgICAgICAgbmV3IERCSW5zdGFuY2UoZGJOYW1lLCBkYlZlcnNpb24sIHNjaGVtYUJ1aWxkZXIsIGNvbHVtbnMsIG5hdiwgdGFibGVzLCBmaywgb3B0aW9ucywgcGspO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICB9XHJcbiAgICBjbGFzcyBEQlNjaGVtYUludGVybmFsICB7XHJcbiAgICAgICAgcHVibGljIHN0YXRpYyBpbnN0YW5jZU1hcCA6IHt9ID0ge307IFxyXG4gICAgfVxyXG4gICAgY2xhc3MgREJJbnN0YW5jZSB7XHJcbiAgICAgICAgY29uc3RydWN0b3IoIFxyXG4gICAgICAgICAgICBwdWJsaWMgZGJOYW1lOiBzdHJpbmcsXHJcbiAgICAgICAgICAgIHB1YmxpYyBkYlZlcnNpb246IG51bWJlciwgXHJcbiAgICAgICAgICAgIHB1YmxpYyBzY2hlbWFCdWlsZGVyOiBsZi5zY2hlbWEuQnVpbGRlcixcclxuICAgICAgICAgICAgcHVibGljIHNjaGVtYTogT2JqZWN0LFxyXG4gICAgICAgICAgICBwdWJsaWMgbmF2OiBPYmplY3QsXHJcbiAgICAgICAgICAgIHB1YmxpYyB0YWJsZXM6IHN0cmluZ1tdLFxyXG4gICAgICAgICAgICBwdWJsaWMgZms6IE9iamVjdCxcclxuICAgICAgICAgICAgcHVibGljIG9wdGlvbnM6IE9iamVjdCxcclxuICAgICAgICAgICAgcHVibGljIHBrOiBPYmplY3Qpe31cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgcHVibGljIG5ld1RhYmxlTWFwKCl7XHJcbiAgICAgICAgICAgIHZhciBtYXAgPSB7fTtcclxuICAgICAgICAgICAgZm9yICh2YXIgaT0wIDsgaTx0aGlzLnRhYmxlcy5sZW5ndGg7IGkrKyl7XHJcbiAgICAgICAgICAgICAgICBtYXBbdGhpcy50YWJsZXNbaV1dPVtdO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiBtYXA7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBleHBvcnQgY2xhc3MgREJDb250ZXh0PEVfQ1RYPiB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgcHJpdmF0ZSBjb250ZXh0IDogIERCQ29udGV4dEludGVybmFsO1xyXG4gICAgXHJcbiAgICAgICAgcHVibGljIHJlYWR5OiBQcm9taXNlPGFueT47ICAgIFxyXG4gICAgICAgIHByaXZhdGUgbG9hZGluZzogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgICAgIHByaXZhdGUgbG9hZGVkOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3RydWN0b3IoZGJOYW1lOiBzdHJpbmcsIGRiU3RvcmVUeXBlPzogbGYuc2NoZW1hLkRhdGFTdG9yZVR5cGUsIGRiU2l6ZU1CPzogbnVtYmVyKSB7ICAgICAgIFxyXG4gICAgICAgICAgICB0aGlzLmNvbnRleHQgPSBuZXcgREJDb250ZXh0SW50ZXJuYWwoKTtcclxuICAgICAgICAgICAgdGhpcy5jb250ZXh0LmRiU3RvcmVUeXBlID0gKGRiU3RvcmVUeXBlPT09dW5kZWZpbmVkKSA/IGxmLnNjaGVtYS5EYXRhU3RvcmVUeXBlLldFQl9TUUwgOiBkYlN0b3JlVHlwZTsgXHJcbiAgICAgICAgICAgIHRoaXMuY29udGV4dC5kYkluc3RhbmNlID0gREJTY2hlbWFJbnRlcm5hbC5pbnN0YW5jZU1hcFtkYk5hbWVdOyAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgZGJTaXplID0gKGRiU2l6ZU1CIHx8IDEpICogMTAyNCAqIDEwMjQ7IC8qIGRiIHNpemUgMTAyNCoxMDI0ID0gMU1CICovXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICAgICAgICAgIHRoaXMucmVhZHkgPSBuZXcgUHJvbWlzZSgocmVzb2x2ZSxyZWplY3QpPT57XHJcbiAgICAgICAgICAgICAgICB0cnl7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNvbnRleHQuZGJJbnN0YW5jZS5zY2hlbWFCdWlsZGVyLmNvbm5lY3QoeyBcclxuICAgICAgICAgICAgICAgICAgICBzdG9yZVR5cGU6IHNlbGYuY29udGV4dC5kYlN0b3JlVHlwZSxcclxuICAgICAgICAgICAgICAgICAgICB3ZWJTcWxEYlNpemU6IGRiU2l6ZSB9KVxyXG4gICAgICAgICAgICAgICAgLnRoZW4oZGIgPT4geyBcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbnRleHQuZGIgPSBkYjtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAvLyBnZXQgc2NoZW1hIGZvciB0YWJsZXNcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbnRleHQudGFibGVTY2hlbWFNYXAgPSB0aGlzLmNvbnRleHQuZGJJbnN0YW5jZS5uZXdUYWJsZU1hcCgpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29udGV4dC50YWJsZXMgPSBbXTtcclxuICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciB0YWJsZSBpbiB0aGlzLmNvbnRleHQudGFibGVTY2hlbWFNYXAgICl7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCB0PSB0aGlzLmNvbnRleHQuZGIuZ2V0U2NoZW1hKCkudGFibGUodGFibGUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbnRleHQudGFibGVTY2hlbWFNYXBbdGFibGVdID0gdDsgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY29udGV4dC50YWJsZXMucHVzaCh0KTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpOyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgfSk7ICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNhdGNoIChlKXtcclxuICAgICAgICAgICAgICAgICAgICByZWplY3QoZSk7XHJcbiAgICAgICAgICAgICAgICB9ICAgXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyB0aGlzIHdpbGwgZGVsZXRlIGFsbCByb3dzIGZyb20gYWxsIHRhYmxlcyBhZCBwdXJnZSBhbGwga2V5IGFuZCBkYnRpbWVzdGFtcCBpbmRlY2VzIFxyXG4gICAgICAgIHB1YmxpYyBwdXJnZSgpIDogUHJvbWlzZTxhbnk+IHtcclxuICAgICAgICAgICAgdmFyIHR4PSB0aGlzLmNvbnRleHQuZGIuY3JlYXRlVHJhbnNhY3Rpb24oKTtcclxuICAgICAgICAgICAgdmFyIHE9W107XHJcbiAgICAgICAgICAgIGZvciAodmFyIHROYW1lIGluIHRoaXMuY29udGV4dC50YWJsZVNjaGVtYU1hcCl7XHJcbiAgICAgICAgICAgICAgICB2YXIgdGFibGUgPSB0aGlzLmNvbnRleHQudGFibGVTY2hlbWFNYXBbdE5hbWVdO1xyXG4gICAgICAgICAgICAgICAgcS5wdXNoKHRoaXMuY29udGV4dC5kYi5kZWxldGUoKS5mcm9tKHRhYmxlKSk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHRoaXMuY29udGV4dC5wdXJnZUtleXModE5hbWUpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMuY29udGV4dC5wdXJnZUtleXMoJ2RidGltZXN0YW1wJyk7XHJcbiAgICAgICAgICAgIHJldHVybiB0eC5leGVjKHEpO1xyXG4gICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgLy8gb3BlbiBhIG5ldyB0cmFuc2FjdGlvbiB3aXRoIGFuIGV4Y2x1c2l2ZSBsb2NrIG9uIHRoZSBzcGVjaWZpZWQgdGFibGVzXHJcbiAgICAgICAgcHVibGljIHRyYW5zYWN0aW9uKCBmbjogKHR4OiBsZi5UcmFuc2FjdGlvbiwgY29udGV4dDogRV9DVFgpPT5Qcm9taXNlPGFueT4pIDogUHJvbWlzZTxhbnk+e1xyXG4gICAgICAgICAgICB0aGlzLmNvbnRleHQudHg9IHRoaXMuY29udGV4dC5kYi5jcmVhdGVUcmFuc2FjdGlvbigpO1xyXG4gICAgICAgICAgICAvLyBnZXQgYSBsb2NrIG9uIGFsbCB0aGUgdGFibGVzIGluIHRoZSBEQkNvbnRleHRcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29udGV4dC50eC5iZWdpbih0aGlzLmNvbnRleHQudGFibGVzKS50aGVuKCgpPT57XHJcbiAgICAgICAgICAgICAgICB2YXIgcD0gZm4odGhpcy5jb250ZXh0LnR4LDxFX0NUWD50aGlzLmNvbnRleHQudGFibGVTY2hlbWFNYXApLnRoZW4oKCk9PntcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbnRleHQudHguY29tbWl0KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb250ZXh0LnR4PSB1bmRlZmluZWQ7ICAgIFxyXG4gICAgICAgICAgICAgICAgfSk7ICAgICAgICBcclxuICAgICAgICAgICAgICAgIHJldHVybiBwOyAgICAgICBcclxuICAgICAgICAgICAgfSk7ICAgICAgICAgXHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHB1YmxpYyBnZXQgdGFibGVzKCkgOiBFX0NUWHtcclxuICAgICAgICAgICAgcmV0dXJuIDxFX0NUWD50aGlzLmNvbnRleHQudGFibGVTY2hlbWFNYXA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHB1YmxpYyBzZWxlY3QoLi4uY29sdW1uczogbGYuc2NoZW1hLkNvbHVtbltdKSA6IGxmLnF1ZXJ5LlNlbGVjdCB7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbnRleHQuZGIuc2VsZWN0LmFwcGx5KHRoaXMuY29udGV4dC5kYixjb2x1bW5zKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcHVibGljIGdldENoZWNrcG9pbnQoKSA6IG51bWJlciB7XHJcbiAgICAgICAgICAgIGlmICghbG9jYWxTdG9yYWdlKSB0aHJvdyBuZXcgRXJyb3IoJ2xvY2Fsc3RvcmFnZSBub3Qgc3VwcG9ydGVkIScpO1xyXG4gICAgICAgICAgICB2YXIga2V5ID0gYCR7dGhpcy5jb250ZXh0LmRiSW5zdGFuY2UuZGJOYW1lfSR7dGhpcy5jb250ZXh0LmRiU3RvcmVUeXBlfS5kYnRpbWVzdGFtcC5tYXN0ZXJJbmRleGA7XHJcbiAgICAgICAgICAgIHZhciBzPWxvY2FsU3RvcmFnZS5nZXRJdGVtKGtleSk7XHJcbiAgICAgICAgICAgIGlmICghcykgcmV0dXJuIDBcclxuICAgICAgICAgICAgdmFyIG4gPSBwYXJzZUludChzKTtcclxuICAgICAgICAgICAgaWYgKGlzTmFOKG4pKSByZXR1cm4gMDtcclxuICAgICAgICAgICAgcmV0dXJuIG47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIFxyXG4gICAgICAgIHB1YmxpYyBEQkVudGl0eTxULCBFX0NUWCwgVF9DVFg+KCB0YWJsZU5hbWU6c3RyaW5nLCBuYXZpZ2F0aW9uUHJvcGVydGllcz86IHN0cmluZ1tdICl7ICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm4gPERCRW50aXR5PFQsIEVfQ1RYLCBUX0NUWD4+KG5ldyBEQkVudGl0eUludGVybmFsPFQsIEVfQ1RYLCBUX0NUWD4odGhpcy5jb250ZXh0LCB0YWJsZU5hbWUsIG5hdmlnYXRpb25Qcm9wZXJ0aWVzLCB0aGlzLnJlYWR5KSk7XHJcbiAgICAgICAgfSAgICAgICAgICBcclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gcHJpdmF0ZSBjbGFzc2VzXHJcbiAgICBjbGFzcyBEQkNvbnRleHRJbnRlcm5hbCB7XHJcbiAgICAgICAgcHVibGljIGRiSW5zdGFuY2U6IERCSW5zdGFuY2U7XHJcbiAgICAgICAgcHVibGljIGRiU3RvcmVUeXBlOiBsZi5zY2hlbWEuRGF0YVN0b3JlVHlwZTtcclxuICAgICAgICBwdWJsaWMgZGI6IGxmLkRhdGFiYXNlO1xyXG4gICAgICAgIHB1YmxpYyB0YWJsZVNjaGVtYU1hcDogT2JqZWN0O1xyXG4gICAgICAgIHB1YmxpYyB0YWJsZXM6IGxmLnNjaGVtYS5UYWJsZVtdO1xyXG4gICAgICAgIHB1YmxpYyB0eDogbGYuVHJhbnNhY3Rpb247XHJcbiAgICAgICAgXHJcbiAgICAgICAgcHVibGljIGNvbXBvc2UodGFibGU6IHN0cmluZywgcm93czogT2JqZWN0W10sIGZrbWFwOiBPYmplY3QpIDogT2JqZWN0W10ge1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgbWFwID1ma21hcFt0YWJsZV07XHJcbiAgICAgICAgICAgIC8vIGlmIHRoZXJlIGFyZSBubyBmb3JlaWduIGtleXMgdGhlcmUgaXMgbm90aGluZyBtb3JlIHRvIGNvbXBvc2VcclxuICAgICAgICAgICAgaWYgKG1hcCA9PT0gdW5kZWZpbmVkKSByZXR1cm4gcm93cztcclxuICAgICAgICAgICAgdmFyIGtleSA9IG1hcC5jb2x1bW4yOyAgICAgICAgXHJcbiAgICBcclxuICAgICAgICAgICAgLy8gZW50aXRpZXNcclxuICAgICAgICAgICAgY29uc3QgZW50aXRpZXM6IE9iamVjdFtdID0gW107XHJcbiAgICAgICAgICAgIGNvbnN0IGRpc3RpbmN0OiBPYmplY3RbXVtdPSBbXTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGtleXZhbHVlcyA9IHt9O1xyXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHJvd3MubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHJvdyA9IHJvd3NbaV07XHJcbiAgICAgICAgICAgICAgICBjb25zdCBrZXl2YWx1ZSA9IHJvd1t0YWJsZV1ba2V5XTtcclxuICAgICAgICAgICAgICAgIGlmICh1bmRlZmluZWQgPT09IGtleXZhbHVlc1trZXl2YWx1ZV0pIHtcclxuICAgICAgICAgICAgICAgICAgICBrZXl2YWx1ZXNba2V5dmFsdWVdID0gZW50aXRpZXMubGVuZ3RoOyAvL3N0b3JlIHRoZSBpbmRleFxyXG4gICAgICAgICAgICAgICAgICAgIHZhciBmaXJzdCA9IHJvd1t0YWJsZV07IC8vIG9ubHkgc2F2ZSB0aGUgZmlyc3QgZWxlbWVudCB3aXRoIHRoaXMga2V5dmFsdWVcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAvLyBjbG9uZSBiZWZvcmUgbWFraW5nIG1vZGlmaWNhdGlvbiB0byBwcmV2ZW50IGxvdmVmaWVsZCBpbmRleCBjYWNoZSBmcm9tXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gYmVpbmcgY29ycnVwdGVkXHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIGNsb25lID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShmaXJzdCkpO1xyXG4gICAgICAgICAgICAgICAgICAgIGVudGl0aWVzLnB1c2goY2xvbmUpOyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgdmFyIGluZGV4ID0ga2V5dmFsdWVzW2tleXZhbHVlXTtcclxuICAgICAgICAgICAgICAgIGlmIChkaXN0aW5jdFtpbmRleF09PT0gdW5kZWZpbmVkKVxyXG4gICAgICAgICAgICAgICAgICAgIGRpc3RpbmN0W2luZGV4XSA9IFtdO1xyXG4gICAgICAgICAgICAgICAgZGlzdGluY3RbaW5kZXhdLnB1c2gocm93KTsgLy8gc3RvcmUgdGhlIHJvdyBpbiBhIGxvb2t1cCB0YWJsZVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGZvciAodmFyIGtleXZhbHVlIGluIGtleXZhbHVlcyl7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBpbmRleCA9IGtleXZhbHVlc1trZXl2YWx1ZV07XHJcbiAgICAgICAgICAgICAgICByb3dzID0gZGlzdGluY3RbaW5kZXhdO1xyXG4gICAgXHJcbiAgICAgICAgICAgICAgICAvLyBwb3NpdGlvbiBjaGlsZHJlbiAocmVjdXJzaXZlKVxyXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgej0wOyB6PCByb3dzLmxlbmd0aDsgeisrKXtcclxuICAgICAgICAgICAgICAgICAgICAvLyBjbG9uZSBiZWZvcmUgbWFraW5nIG1vZGlmaWNhdGlvbiB0byBwcmV2ZW50IGxvdmVmaWVsZCBpbmRleCBjYWNoZSBmcm9tXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gYmVpbmcgY29ycnVwdGVkXHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIHJvdyA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkocm93c1t6XSkpOyAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbXBvc2VfKHRhYmxlLHJvdyxlbnRpdGllc1tpbmRleF0pO1xyXG4gICAgICAgICAgICAgICAgfSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiBlbnRpdGllcztcclxuICAgICAgICB9IFxyXG4gICAgICAgIFxyXG4gICAgICAgIHByaXZhdGUgY29tcG9zZV8odGFibGU6c3RyaW5nLCByb3c6IE9iamVjdCwgcGFyZW50OiBPYmplY3QpIHtcclxuICAgICAgICAgICAgdmFyIG5hdnMgPSB0aGlzLmRiSW5zdGFuY2UubmF2W3RhYmxlXTtcclxuICAgICAgICAgICAgZm9yICh2YXIgY29sdW1uIGluIG5hdnMpXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIHZhciBuYXYgPSBuYXZzW2NvbHVtbl07XHJcbiAgICAgICAgICAgICAgICB2YXIgY2hpbGQgPSByb3dbbmF2LnRhYmxlTmFtZV07XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIC8vIGJ1Zz8gaW4gc29tZSBjYXNlcyBjaGlsZCBpcyB1bmRlZmluZWRcclxuICAgICAgICAgICAgICAgIGlmIChjaGlsZCl7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKG5hdi5pc0FycmF5KXtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHVuZGVmaW5lZCA9PT0gcGFyZW50W25hdi5jb2x1bW5OYW1lXSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudFtuYXYuY29sdW1uTmFtZV0gPSBbY2hpbGRdXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsc2UgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXJlbnRbbmF2LmNvbHVtbk5hbWVdLnB1c2goY2hpbGQpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50W25hdi5jb2x1bW5OYW1lXSA9IGNoaWxkO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbXBvc2VfKG5hdi50YWJsZU5hbWUsIHJvdywgY2hpbGQpXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgcHVibGljIGRlY29tcG9zZSggdGFibGU6c3RyaW5nLCBlbnRpdGllczogT2JqZWN0W10gKXtcclxuICAgICAgICAgICAgdmFyIG1hcCA9IHRoaXMuZGJJbnN0YW5jZS5uZXdUYWJsZU1hcCgpO1xyXG4gICAgICAgICAgICBmb3IgKHZhciBpPTA7IGk8ZW50aXRpZXMubGVuZ3RoOyBpKyspe1xyXG4gICAgICAgICAgICAgICAgdmFyIGU9ZW50aXRpZXNbaV07XHJcbiAgICAgICAgICAgICAgICBtYXBbdGFibGVdLnB1c2goZSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRlY29tcG9zZV8odGFibGUsIGUsIG1hcCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIG1hcDtcclxuICAgICAgICB9XHJcbiAgICAgICAgcHJpdmF0ZSBkZWNvbXBvc2VfKCB0YWJsZTpzdHJpbmcsIGVudGl0eTogT2JqZWN0LCBtYXA6IE9iamVjdCApe1xyXG4gICAgICAgICAgICBmb3IgKHZhciBwcm9wIGluIGVudGl0eSl7XHJcbiAgICAgICAgICAgICAgICB2YXIgbmF2ID0gdGhpcy5kYkluc3RhbmNlLm5hdlt0YWJsZV1bcHJvcF07XHJcbiAgICAgICAgICAgICAgICBpZiAobmF2ICE9PSB1bmRlZmluZWQpe1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciB2YWx1ZSA9IGVudGl0eVtwcm9wXTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoaXMuYXJyYXkodmFsdWUpKXtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgaT0wOyBpPHZhbHVlLmxlbmd0aDsgaSsrKXtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1hcFtuYXYudGFibGVOYW1lXS5wdXNoKHZhbHVlW2ldKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGVjb21wb3NlXyhuYXYudGFibGVOYW1lLCB2YWx1ZVtpXSwgbWFwKTsgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoaXMub2JqZWN0KHZhbHVlKSl7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG1hcFtuYXYudGFibGVOYW1lXS5wdXNoKHZhbHVlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWNvbXBvc2VfKG5hdi50YWJsZU5hbWUsIHZhbHVlLCBtYXApO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9ICAgIFxyXG4gICAgXHJcbiAgICAgICAgcHVibGljIGFsbG9jYXRlS2V5cyh0YWJsZTpzdHJpbmcsIHRha2U/Om51bWJlcik6bnVtYmVyIHtcclxuICAgICAgICAgICAgdmFyIGtleSA9IGAke3RoaXMuZGJJbnN0YW5jZS5kYk5hbWV9JHt0aGlzLmRiU3RvcmVUeXBlfS4ke3RhYmxlfS5tYXN0ZXJJbmRleGA7XHJcbiAgICAgICAgICAgIHZhciBsc3ZhbHVlID0gd2luZG93LmxvY2FsU3RvcmFnZS5nZXRJdGVtKCBrZXkgKTtcclxuICAgICAgICAgICAgdmFyIHZhbHVlOm51bWJlciwgbmV4dHZhbHVlOm51bWJlcjtcclxuICAgICAgICAgICAgaWYgKGxzdmFsdWUgPT09IG51bGwpIHZhbHVlPTE7IGVsc2UgdmFsdWUgPSBwYXJzZUludChsc3ZhbHVlKTtcclxuICAgICAgICAgICAgbmV4dHZhbHVlID0gdmFsdWU7XHJcbiAgICAgICAgICAgIGlmICghdGFrZSkgdGFrZT0xO1xyXG4gICAgICAgICAgICBuZXh0dmFsdWUgKz0gdGFrZTsgXHJcbiAgICAgICAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbShrZXksIG5leHR2YWx1ZS50b1N0cmluZygpKTtcclxuICAgICAgICAgICAgLy9jb25zb2xlLmxvZyhgJHt0YWJsZX06JHt2YWx1ZX1gKTtcclxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlOyAgICAgICAgXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHB1YmxpYyByb2xsYmFja0tleXModGFibGU6c3RyaW5nLCBpZEluZGV4Om51bWJlcil7XHJcbiAgICAgICAgICAgIHZhciBrZXkgPSBgJHt0aGlzLmRiSW5zdGFuY2UuZGJOYW1lfSR7dGhpcy5kYlN0b3JlVHlwZX0uJHt0YWJsZX0ubWFzdGVySW5kZXhgO1xyXG4gICAgICAgICAgICB3aW5kb3cubG9jYWxTdG9yYWdlLnNldEl0ZW0oa2V5LCAoaWRJbmRleC0xKS50b1N0cmluZygpKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcHVibGljIHB1cmdlS2V5cyh0YWJsZTpzdHJpbmcpIHtcclxuICAgICAgICAgICAgdmFyIGtleSA9IGAke3RoaXMuZGJJbnN0YW5jZS5kYk5hbWV9JHt0aGlzLmRiU3RvcmVUeXBlfS4ke3RhYmxlfS5tYXN0ZXJJbmRleGA7XHJcbiAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKGtleSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHB1YmxpYyBleGVjKHE6YW55KXtcclxuICAgICAgICAgICAgaWYgKHRoaXMudHgpe1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMudHguYXR0YWNoKHEpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHEuZXhlYygpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSAgIFxyXG4gICAgICAgIFxyXG4gICAgICAgIHB1YmxpYyBleGVjTWFueShxOmFueVtdKXtcclxuICAgICAgICAgICAgaWYgKHRoaXMudHgpeyAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgcT1xLnJldmVyc2UoKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLl9leGVjTWFueShxKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHZhciB0eCA9IHRoaXMuZGIuY3JlYXRlVHJhbnNhY3Rpb24oKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiB0eC5leGVjKHEpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHByaXZhdGUgX2V4ZWNNYW55KHE6YW55W10pe1xyXG4gICAgICAgICAgICB2YXIgcTEgPSBxLnBvcCgpO1xyXG4gICAgICAgICAgICB2YXIgYSA9IHRoaXMudHguYXR0YWNoKHExKTtcclxuICAgICAgICAgICAgaWYgKHEubGVuZ3RoID09PSAwKSByZXR1cm4gYTtcclxuICAgICAgICAgICAgZWxzZSByZXR1cm4gYS50aGVuKCgpPT57IHJldHVybiB0aGlzLmV4ZWNNYW55KHEpIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgIH1cclxuICAgIFxyXG4gICAgaW50ZXJmYWNlIFF1ZXJ5Sm9pbiB7XHJcbiAgICAgICAgdGFibGU6IGxmLnNjaGVtYS5UYWJsZTtcclxuICAgICAgICBwcmVkaWNhdGVsZWZ0OiBsZi5zY2hlbWEuQ29sdW1uO1xyXG4gICAgICAgIHByZWRpY2F0ZXJpZ2h0OiBsZi5zY2hlbWEuQ29sdW1uO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjbGFzcyBEQkVudGl0eUludGVybmFsPFQsIEVfQ1RYLCBUX0NUWD4gaW1wbGVtZW50cyBEQkVudGl0eTxULCBFX0NUWCwgVF9DVFg+IHtcclxuICAgIFxyXG4gICAgICAgIHByaXZhdGUgY29udGV4dCA6IERCQ29udGV4dEludGVybmFsO1xyXG4gICAgICAgIHByaXZhdGUgdGFibGVOYW1lIDogc3RyaW5nO1xyXG4gICAgICAgIHByaXZhdGUgbmF2aWdhdGlvblByb3BlcnRpZXM6IHN0cmluZ1tdPVtdO1xyXG4gICAgICAgIHByaXZhdGUgbmF2aWdhdGlvblRhYmxlczogc3RyaW5nW109W107XHJcbiAgICAgICAgcHJpdmF0ZSB0YWJsZXM6IHN0cmluZ1tdPVtdO1xyXG4gICAgICAgIHByaXZhdGUgbmF2OiBPYmplY3Q7XHJcbiAgICAgICAgcHJpdmF0ZSBma21hcDogT2JqZWN0O1xyXG4gICAgICAgIHByaXZhdGUgcGs6IHN0cmluZztcclxuICAgICAgICBcclxuICAgICAgICAvLyB1c2VkIGZvciBxdWVyeSgpXHJcbiAgICAgICAgcHJpdmF0ZSBqb2luOiBRdWVyeUpvaW5bXT1bXTtcclxuICAgICAgICBwcml2YXRlIHRibG1hcDogT2JqZWN0PXt9O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0cnVjdG9yKGNvbnRleHQ6IERCQ29udGV4dEludGVybmFsLCB0YWJsZU5hbWU6c3RyaW5nLCBuYXZpZ2F0aW9uUHJvcGVydGllcz86IHN0cmluZ1tdLCByZWFkeT86IFByb21pc2U8YW55Pikge1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB0aGlzLmNvbnRleHQgPSBjb250ZXh0O1xyXG4gICAgICAgICAgICB0aGlzLnRhYmxlTmFtZSA9IHRhYmxlTmFtZTsgICAgICAgIFxyXG4gICAgICAgICAgICB0aGlzLm5hdmlnYXRpb25Qcm9wZXJ0aWVzID0gbmF2aWdhdGlvblByb3BlcnRpZXMgfHwgW107XHJcbiAgICAgICAgICAgIHRoaXMubmF2ID0gY29udGV4dC5kYkluc3RhbmNlLm5hdlt0YWJsZU5hbWVdO1xyXG4gICAgICAgICAgICB0aGlzLnBrID0gY29udGV4dC5kYkluc3RhbmNlLnBrW3RhYmxlTmFtZV07XHJcbiAgICAgICAgICAgIGZvciAodmFyIGNvbHVtbiBpbiB0aGlzLm5hdilcclxuICAgICAgICAgICAgICAgIHRoaXMubmF2aWdhdGlvblRhYmxlcy5wdXNoKCB0aGlzLm5hdltjb2x1bW5dLnRhYmxlTmFtZSk7XHJcbiAgICAgICAgICAgIGZvciAodmFyIGk9MDsgaTx0aGlzLm5hdmlnYXRpb25UYWJsZXMubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgICAgICAgICB0aGlzLnRhYmxlcy5wdXNoKHRoaXMubmF2aWdhdGlvblRhYmxlc1tpXSk7XHJcbiAgICAgICAgICAgIHRoaXMudGFibGVzLnB1c2godGhpcy50YWJsZU5hbWUpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdGhpcy5ma21hcCA9IHt9O1xyXG4gICAgICAgICAgICBmb3IgKHZhciBpPTA7IGk8dGhpcy50YWJsZXMubGVuZ3RoOyBpKyspe1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciB0YWJsZU5hbWUgPSB0aGlzLnRhYmxlc1tpXTsgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBma2V5cyA9IHRoaXMuY29udGV4dC5kYkluc3RhbmNlLmZrW3RhYmxlTmFtZV07XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIC8vIGRldGVybWluZSBpZiB0aGVyZSBhcmUgZmtleXMgdG8gYW55IG5hdmlnYXRpb24gdGFibGVzXHJcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBjb2x1bW4gaW4gZmtleXMpe1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBmayA9IGZrZXlzW2NvbHVtbl07XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMudGFibGVzLmluZGV4T2YoZmsuZmtUYWJsZSkgIT09IC0xKXtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy9ma21hcFt0YWJsZU5hbWVdLnB1c2goZmspO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZrbWFwW3RhYmxlTmFtZV09e1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFibGUxOiB0YWJsZU5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb2x1bW4xOiBjb2x1bW4sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0YWJsZTI6IGZrLmZrVGFibGUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb2x1bW4yOiBmay5ma0NvbHVtblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZrbWFwW2ZrLmZrVGFibGVdPXtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhYmxlMTogZmsuZmtUYWJsZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbHVtbjE6IGZrLmZrQ29sdW1uLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFibGUyOiB0YWJsZU5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb2x1bW4yOiBjb2x1bW5cclxuICAgICAgICAgICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgICAgICB9ICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIHNvcnQgdGFibGVzIGZvciB3cml0aW5nIGluIHRoZSBjb3JyZWN0IG9yZGVyIChmayBjb25zdHJhaW50cylcclxuICAgICAgICAgICAgdGhpcy50YWJsZXMuc29ydCgoYSxiKT0+e1xyXG4gICAgICAgICAgICAgICAgdmFyIHQxID0gdGhpcy5ma21hcFthXTtcclxuICAgICAgICAgICAgICAgIHZhciB0MiA9IHRoaXMuZmttYXBbYl07XHJcbiAgICAgICAgICAgICAgICAvL2lmIChpcy51bmRlZmluZWQodDEpKSByZXR1cm4gMTtcclxuICAgICAgICAgICAgICAgIC8vaWYgKGlzLnVuZGVmaW5lZCh0MikpIHJldHVybiAtMTtcclxuICAgICAgICAgICAgICAgIGlmICh0MS50YWJsZTIgPT09IGIpIHJldHVybiAtMTtcclxuICAgICAgICAgICAgICAgIGlmICh0Mi50YWJsZTIgPT09IGEpIHJldHVybiAxO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIDA7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAvL2NvbnNvbGUubG9nKHRoaXMudGFibGVzKTtcclxuICAgICAgICBcclxuICAgICAgICAgICAgLypcclxuICAgICAgICAgICAgY29uc29sZS5ncm91cCh0aGlzLnRhYmxlTmFtZSk7ICAgICAgICBcclxuICAgICAgICAgICAgY29uc29sZS5sb2codGhpcy5ma21hcCk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZ3JvdXBFbmQoKTtcclxuICAgICAgICAgICAgKi9cclxuICAgICAgICAgICAgcmVhZHkudGhlbigoKT0+e1xyXG4gICAgICAgICAgICAgICAgLy8gbWFwIHRhYmxlcyBmb3Igam9pbnNcclxuICAgICAgICAgICAgICAgIHZhciB0YWJsZVNjaGVtYSA9IGNvbnRleHQudGFibGVTY2hlbWFNYXBbdGhpcy50YWJsZU5hbWVdO1xyXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgcHJvcCBpbiB0YWJsZVNjaGVtYSl7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpc1twcm9wXSA9IHRhYmxlU2NoZW1hW3Byb3BdO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB0aGlzLnRibG1hcFt0aGlzLnRhYmxlTmFtZV0gPSB0YWJsZVNjaGVtYTtcclxuICAgICAgICAgICAgICAgIGZvciAodmFyIGk9MDsgaTx0aGlzLm5hdmlnYXRpb25UYWJsZXMubGVuZ3RoOyBpKyspeyAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIHRhYmxlTmFtZSA9IHRoaXMubmF2aWdhdGlvblRhYmxlc1tpXTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnRibG1hcFt0YWJsZU5hbWVdID0gdGhpcy5jb250ZXh0LnRhYmxlU2NoZW1hTWFwW3RhYmxlTmFtZV07Ly9kYi5nZXRTY2hlbWEoKS50YWJsZSh0YWJsZU5hbWUpOyAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaT0wOyBpPHRoaXMubmF2aWdhdGlvblRhYmxlcy5sZW5ndGg7IGkrKyl7IFxyXG4gICAgICAgICAgICAgICAgICAgIHZhciB0YWJsZU5hbWUgPSB0aGlzLm5hdmlnYXRpb25UYWJsZXNbaV07XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIGZrID0gdGhpcy5ma21hcFt0YWJsZU5hbWVdOyAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICB2YXIgcCA9IHsgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhYmxlOiB0aGlzLnRibG1hcFt0YWJsZU5hbWVdLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBwcmVkaWNhdGVsZWZ0OiB0aGlzLnRibG1hcFtmay50YWJsZTJdW2ZrLmNvbHVtbjJdLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBwcmVkaWNhdGVyaWdodDogdGhpcy50YmxtYXBbZmsudGFibGUxXVtmay5jb2x1bW4xXVxyXG4gICAgICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5qb2luLnB1c2gocCk7XHJcbiAgICAgICAgICAgICAgICB9ICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIH0pOyBcclxuICAgIFxyXG4gICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgcHVibGljIHB1dChlbnRpdHk6IGFueSkgOiBQcm9taXNlPGFueT4ge1xyXG4gICAgICAgICAgICB2YXIgZW50aXRpZXM6IERCTW9kZWxbXTtcclxuICAgICAgICAgICAgaWYgKGlzLmFycmF5KGVudGl0eSkpIGVudGl0aWVzID0gZW50aXR5OyBlbHNlIGVudGl0aWVzID0gW2VudGl0eV07ICAgXHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIGRlY29tcG9zZSBlbnRpdGllcyAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIHRhYmxlcz0gdGhpcy5jb250ZXh0LmRlY29tcG9zZSh0aGlzLnRhYmxlTmFtZSwgZW50aXRpZXMpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gY2FsY3VsYXRlIHBrZXlzXHJcbiAgICAgICAgICAgIHZhciBrZXlzID0ge307XHJcbiAgICAgICAgICAgIGZvciAobGV0IHRhYmxlTmFtZSBpbiB0YWJsZXMpe1xyXG4gICAgICAgICAgICAgICAgbGV0IGRpcnR5UmVjb3JkcyA9IHRhYmxlc1t0YWJsZU5hbWVdO1xyXG4gICAgICAgICAgICAgICAgaWYgKGRpcnR5UmVjb3Jkcy5sZW5ndGggPiAwKXsgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGtleXNbdGFibGVOYW1lXSA9IHRoaXMucHV0X2NhbGN1bGF0ZUtleXMoZGlydHlSZWNvcmRzLHRhYmxlTmFtZSk7ICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIH0gICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIH0gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIGNhbGN1bGF0ZSBma2V5c1xyXG4gICAgICAgICAgICBmb3IgKHZhciBpPTA7IGk8ZW50aXRpZXMubGVuZ3RoOyBpKyspe1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wdXRfY2FsY3VsYXRlRm9yZWlnbktleXModGhpcy50YWJsZU5hbWUsIGVudGl0aWVzW2ldKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gcHV0IHJvd3MgLSBnZXQgcXVlcmllc1xyXG4gICAgICAgICAgICB2YXIgcSA9IFtdO1xyXG4gICAgICAgICAgICBmb3IgKHZhciBpPTA7IGk8IHRoaXMudGFibGVzLmxlbmd0aDsgaSsrKXsgLy8gdXNlIHRoaXMudGFibGVzIHNpbmNlIGl0cyBwcmVzb3J0ZWQgZm9yIGluc2VydHNcclxuICAgICAgICAgICAgICAgIGxldCB0YWJsZU5hbWUgPSB0aGlzLnRhYmxlc1tpXTsgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGxldCBkaXJ0eVJlY29yZHMgPSB0YWJsZXNbdGFibGVOYW1lXTtcclxuICAgICAgICAgICAgICAgIGlmIChkaXJ0eVJlY29yZHMubGVuZ3RoID4gMCl7ICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBxLnB1c2godGhpcy5wdXRfZXhlY3V0ZShkaXJ0eVJlY29yZHMsIHRhYmxlTmFtZSwgdGhpcy5jb250ZXh0LmRiLCBrZXlzKSk7ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgfSAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgfSBcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIGV4ZWN1dGUgLyBhdHRhY2hcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbnRleHQuZXhlY01hbnkocSkudGhlbihcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHI9PntcclxuICAgICAgICAgICAgICAgIC8vIHJldHVybiBqdXN0IHRoZSBpZHMgZm9yIHRoZSByb290IGVudGl0aXlcclxuICAgICAgICAgICAgICAgIHZhciBpZHMgPSBlbnRpdGllcy5tYXAoKHZhbHVlOiBEQk1vZGVsLCBpbmRleDogbnVtYmVyLCBhcnJheTogREJNb2RlbFtdKT0+e1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZVt0aGlzLnBrXTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgaWYgKGlkcy5sZW5ndGggPT09IDEpIHJldHVybiBpZHNbMF07XHJcbiAgICAgICAgICAgICAgICBlbHNlIHJldHVybiBpZHM7ICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBlPT57XHJcbiAgICAgICAgICAgICAgICBmb3IgKGxldCB0YWJsZU5hbWUgaW4gdGFibGVzKXtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgcm9sbGJhY2sgPSBrZXlzW3RhYmxlTmFtZV07XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJvbGxiYWNrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyb2xsYmFjay5kYnRzSW5kZXgpIHRoaXMuY29udGV4dC5yb2xsYmFja0tleXMoJ2RidGltZXN0YW1wJywgcm9sbGJhY2suZGJ0c0luZGV4KSAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY29udGV4dC5yb2xsYmFja0tleXModGFibGVOYW1lLCByb2xsYmFjay5pbmRleCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgdGhyb3cgZTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgIC8qXHJcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChxKS50aGVuKCgpPT57IFxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIC8vIHJldHVybiBqdXN0IHRoZSBpZHMgZm9yIHRoZSByb290IGVudGl0aXlcclxuICAgICAgICAgICAgICAgIHZhciBpZHMgPSBlbnRpdGllcy5tYXAoKHZhbHVlOiBEQk1vZGVsLCBpbmRleDogbnVtYmVyLCBhcnJheTogREJNb2RlbFtdKT0+e1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZVt0aGlzLnBrXTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgaWYgKGlkcy5sZW5ndGggPT09IDEpIHJldHVybiBpZHNbMF07XHJcbiAgICAgICAgICAgICAgICBlbHNlIHJldHVybiBpZHM7XHJcbiAgICAgICAgICAgIH0pOyAgICAqLyAgICAgICAgICAgXHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHByaXZhdGUgcHV0X2NhbGN1bGF0ZUZvcmVpZ25LZXlzKHRhYmxlOnN0cmluZywgZW50aXR5OkRCTW9kZWwsIHBhcmVudD86REJNb2RlbCwgcGFyZW50VGFibGU/OiBzdHJpbmcpe1xyXG4gICAgXHJcbiAgICAgICAgICAgIGZvciAodmFyIHByb3AgaW4gZW50aXR5KXtcclxuICAgICAgICAgICAgICAgIHZhciBuYXYgPSB0aGlzLmNvbnRleHQuZGJJbnN0YW5jZS5uYXZbdGFibGVdW3Byb3BdOyAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAobmF2ICE9PSB1bmRlZmluZWQpe1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBma0NvbHVtbnMgPSB0aGlzLmNvbnRleHQuZGJJbnN0YW5jZS5ma1tuYXYudGFibGVOYW1lXTtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgcGFyZW50RmtDb2x1bW5zID0gdGhpcy5jb250ZXh0LmRiSW5zdGFuY2UuZmtbdGFibGVdO1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciB2YWx1ZSA9IGVudGl0eVtwcm9wXTtcclxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQgPSBlbnRpdHk7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzLmFycmF5KHZhbHVlKSl7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAodmFyIGk9MDsgaTx2YWx1ZS5sZW5ndGg7IGkrKyl7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWxjdWxhdGVGb3JlaWduS2V5cyh2YWx1ZVtpXSxlbnRpdHksIGZrQ29sdW1ucywgcGFyZW50RmtDb2x1bW5zLCBuYXYudGFibGVOYW1lLCB0YWJsZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnB1dF9jYWxjdWxhdGVGb3JlaWduS2V5cyhuYXYudGFibGVOYW1lLCB2YWx1ZVtpXSwgcGFyZW50LCB0YWJsZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoaXMub2JqZWN0KHZhbHVlKSl7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGN1bGF0ZUZvcmVpZ25LZXlzKHZhbHVlLGVudGl0eSwgZmtDb2x1bW5zLCBwYXJlbnRGa0NvbHVtbnMsIG5hdi50YWJsZU5hbWUsIHRhYmxlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wdXRfY2FsY3VsYXRlRm9yZWlnbktleXMobmF2LnRhYmxlTmFtZSwgdmFsdWUsIHBhcmVudCwgdGFibGUpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGZ1bmN0aW9uIGNhbGN1bGF0ZUZvcmVpZ25LZXlzKGVudGl0eTogREJNb2RlbCwgcGFyZW50OkRCTW9kZWwsIGZrQ29sdW1uczogT2JqZWN0LCBwYXJlbnRGa0NvbHVtbnM6IE9iamVjdCwgdGFibGU6c3RyaW5nLCBwYXJlbnRUYWJsZTpzdHJpbmcpe1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGZvciAodmFyIGNvbHVtbiBpbiBwYXJlbnRGa0NvbHVtbnMpe1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBma0luZm8gPSBwYXJlbnRGa0NvbHVtbnNbY29sdW1uXTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoZmtJbmZvLmZrVGFibGUgPT09IHRhYmxlKXsgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50W2NvbHVtbl0gPSBlbnRpdHlbZmtJbmZvLmZrQ29sdW1uXTsgXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBjb2x1bW4gaW4gZmtDb2x1bW5zKXtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgZmtJbmZvID0gZmtDb2x1bW5zW2NvbHVtbl07ICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZrSW5mby5ma1RhYmxlID09PSBwYXJlbnRUYWJsZSl7ICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGVudGl0eVtjb2x1bW5dID0gcGFyZW50W2ZrSW5mby5ma0NvbHVtbl07IFxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSAgICAgICAgICAgICAgICBcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgXHJcbiAgICAgICAgcHJpdmF0ZSBwdXRfY2FsY3VsYXRlS2V5cyhkaXJ0eVJlY29yZHM6IERCTW9kZWxbXSwgdGFibGVOYW1lOnN0cmluZyl7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgcGsgPSB0aGlzLmNvbnRleHQuZGJJbnN0YW5jZS5wa1t0YWJsZU5hbWVdO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gc2VsZWN0IGFsbCBvZiB0aGUgcm93cyB3aXRob3V0IGEga2V5XHJcbiAgICAgICAgICAgIHZhciBtaXNzaW5nS2V5OiBudW1iZXJbXSA9IFtdO1xyXG4gICAgICAgICAgICBmb3IgKHZhciBpPTA7IGk8IGRpcnR5UmVjb3Jkcy5sZW5ndGg7IGkrKykgeyAgICAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmIChkaXJ0eVJlY29yZHNbaV1bcGtdID09PSB1bmRlZmluZWQpIG1pc3NpbmdLZXkucHVzaChpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gYWxsb2NhdGUga2V5c1xyXG4gICAgICAgICAgICB2YXIgaWRJbmRleCA9IHRoaXMuY29udGV4dC5hbGxvY2F0ZUtleXModGFibGVOYW1lLCBtaXNzaW5nS2V5Lmxlbmd0aCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBpbnNlcnQga2V5c1xyXG4gICAgICAgICAgICBmb3IgKHZhciBpPTA7IGk8IG1pc3NpbmdLZXkubGVuZ3RoOyBpKyspeyAgICAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGRpcnR5UmVjb3Jkc1ttaXNzaW5nS2V5W2ldXVtwa10gPSBpZEluZGV4ICsgaTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gYWRkIGRiVGltZXN0YW1wIChvcHRpb25hbClcclxuICAgICAgICAgICAgdmFyIGRiVGltZVN0YW1wQ29sdW1uID0gdGhpcy5jb250ZXh0LmRiSW5zdGFuY2Uub3B0aW9uc1t0YWJsZU5hbWVdLmRidGltZXN0YW1wO1xyXG4gICAgICAgICAgICB2YXIgZGJUaW1lU3RhbXBJbmRleDtcclxuICAgICAgICAgICAgaWYgKGRiVGltZVN0YW1wQ29sdW1uKXtcclxuICAgICAgICAgICAgICAgIGRiVGltZVN0YW1wSW5kZXggPSB0aGlzLmNvbnRleHQuYWxsb2NhdGVLZXlzKCdkYnRpbWVzdGFtcCcsIGRpcnR5UmVjb3Jkcy5sZW5ndGgpXHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGZvciAodmFyIGk9MDsgaTwgZGlydHlSZWNvcmRzLmxlbmd0aDsgaSsrKSB7ICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGRpcnR5UmVjb3Jkc1tpXVtkYlRpbWVTdGFtcENvbHVtbl0gPSBkYlRpbWVTdGFtcEluZGV4K2k7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIGFkZCBvcHRpb25hbCBpc0RlbGV0ZWQgY29sdW1uXHJcbiAgICAgICAgICAgIHZhciBpc0RlbGV0ZWRDb2x1bW4gPSB0aGlzLmNvbnRleHQuZGJJbnN0YW5jZS5vcHRpb25zW3RhYmxlTmFtZV0uaXNkZWxldGVkO1xyXG4gICAgICAgICAgICBpZiAoaXNEZWxldGVkQ29sdW1uKXtcclxuICAgICAgICAgICAgICAgIGZvciAodmFyIGk9MDsgaTwgZGlydHlSZWNvcmRzLmxlbmd0aDsgaSsrKSB7ICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGRpcnR5UmVjb3Jkc1tpXVtpc0RlbGV0ZWRDb2x1bW5dID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgICAgaW5kZXg6IGlkSW5kZXgsXHJcbiAgICAgICAgICAgICAgICBkYnRzSW5kZXg6IGRiVGltZVN0YW1wSW5kZXhcclxuICAgICAgICAgICAgfSAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBwcml2YXRlIHB1dF9leGVjdXRlKGRpcnR5UmVjb3JkczogREJNb2RlbFtdLCB0YWJsZU5hbWU6c3RyaW5nLCBkYjogbGYuRGF0YWJhc2UsIGtleXM6IE9iamVjdCl7XHJcbiAgICAgICAgICAgIC8vcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLHJlamVjdCk9PntcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAvLyBjcmVhdGUgcm93cyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB2YXIgdGFibGUgPSB0aGlzLmNvbnRleHQudGFibGVTY2hlbWFNYXBbdGFibGVOYW1lXTsvL2RiLmdldFNjaGVtYSgpLnRhYmxlKHRhYmxlTmFtZSk7XHJcbiAgICAgICAgICAgICAgICB2YXIgY29sdW1ucyA9IHRoaXMuY29udGV4dC5kYkluc3RhbmNlLnNjaGVtYVt0YWJsZU5hbWVdO1xyXG4gICAgICAgICAgICAgICAgdmFyIHJvd3M6IGxmLlJvd1tdID0gW107XHJcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpPTA7IGk8IGRpcnR5UmVjb3Jkcy5sZW5ndGg7IGkrKyl7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIGUgPSBkaXJ0eVJlY29yZHNbaV07XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIHJvdyA9IHt9O1xyXG4gICAgICAgICAgICAgICAgICAgIGZvcih2YXIgeD0wOyB4PCBjb2x1bW5zLmxlbmd0aCA7IHgrKyl7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBjb2x1bW4gPSBjb2x1bW5zW3hdO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByb3dbY29sdW1uXSA9IGVbY29sdW1uXTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgcm93cy5wdXNoKHRhYmxlLmNyZWF0ZVJvdyhyb3cpKTtcclxuICAgICAgICAgICAgICAgIH0gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgLy8gdXBzZXJ0IHF1ZXJ5ICAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIHZhciBxID0gZGIuaW5zZXJ0T3JSZXBsYWNlKCkuaW50byh0YWJsZSkudmFsdWVzKHJvd3MpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHE7XHJcbiAgICAgICAgICAgICAgICAvKlxyXG4gICAgICAgICAgICAgICAgdGhpcy5jb250ZXh0LmV4ZWMocSkudGhlbihcclxuICAgICAgICAgICAgICAgICAgICByPT57cmVzb2x2ZShyKX0sXHJcbiAgICAgICAgICAgICAgICAgICAgZT0+e1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgcm9sbGJhY2sgPSBrZXlzW3RhYmxlTmFtZV07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyb2xsYmFjay5kYnRzSW5kZXgpIHRoaXMuY29udGV4dC5yb2xsYmFja0tleXMoJ2RidGltZXN0YW1wJywgcm9sbGJhY2suZGJ0c0luZGV4KSAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY29udGV4dC5yb2xsYmFja0tleXModGFibGVOYW1lLCByb2xsYmFjay5pbmRleCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChlKTtcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgICovXHJcbiAgICAgICAgICAgIC8vfSkgICAgICAgIFxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBwdWJsaWMgZ2V0KGlkOiBhbnkpOiBQcm9taXNlPGFueT4geyAgICAgICAgXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9nZXQoaWQpLnRoZW4oKHJlc3VsdHMpPT57ICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB2YXIgZW50aXRpZXMgPSB0aGlzLmNvbnRleHQuY29tcG9zZSh0aGlzLnRhYmxlTmFtZSwgcmVzdWx0cywgdGhpcy5ma21hcCk7XHJcbiAgICAgICAgICAgICAgICBpZiAoaXMuYXJyYXkoaWQpIHx8IGlzLnVuZGVmaW5lZChpZCkpIHJldHVybiBlbnRpdGllcztcclxuICAgICAgICAgICAgICAgIGVsc2UgcmV0dXJuIGVudGl0aWVzWzBdO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgfSAgICBcclxuICAgIFxyXG4gICAgICAgIHB1YmxpYyBfZ2V0KGlkOmFueSwgZm9yY2VQdXJnZT86IGJvb2xlYW4pOiBQcm9taXNlPGFueT4ge1xyXG4gICAgICAgICAgICB2YXIgZGIgPSB0aGlzLmNvbnRleHQuZGI7XHJcbiAgICAgICAgICAgIHZhciB0YWJsZSA9IHRoaXMuY29udGV4dC50YWJsZVNjaGVtYU1hcFt0aGlzLnRhYmxlTmFtZV07Ly9kYi5nZXRTY2hlbWEoKS50YWJsZSh0aGlzLnRhYmxlTmFtZSk7IFxyXG4gICAgICAgICAgICB2YXIgcXVlcnkgPSB0aGlzLl9xdWVyeShkYix0YWJsZSk7XHJcbiAgICAgICAgICAgIHZhciBwayA9IHRoaXMuY29udGV4dC5kYkluc3RhbmNlLnBrW3RoaXMudGFibGVOYW1lXTtcclxuICAgICAgICAgICAgdmFyIGRrID0gdGhpcy5jb250ZXh0LmRiSW5zdGFuY2Uub3B0aW9uc1t0aGlzLnRhYmxlTmFtZV1bJ2lzZGVsZXRlZCddOyBcclxuICAgICAgICAgICAgaWYgKGRrID09PSB1bmRlZmluZWQpe1xyXG4gICAgICAgICAgICAgICAgaWYgKGlzLmFycmF5KGlkKSlcclxuICAgICAgICAgICAgICAgICAgICBxdWVyeS53aGVyZSh0YWJsZVtwa10uaW4oaWQpKTtcclxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKGlzLm51bWJlcihpZCkpXHJcbiAgICAgICAgICAgICAgICAgICAgcXVlcnkud2hlcmUodGFibGVbcGtdLmVxKGlkKSk7ICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoaXMuYXJyYXkoaWQpKVxyXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LndoZXJlKGxmLm9wLmFuZCh0YWJsZVtwa10uaW4oaWQpLHRhYmxlW2RrXS5lcShmYWxzZSkpKTtcclxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKGlzLm51bWJlcihpZCkpXHJcbiAgICAgICAgICAgICAgICAgICAgcXVlcnkud2hlcmUobGYub3AuYW5kKHRhYmxlW3BrXS5lcShpZCksdGFibGVbZGtdLmVxKGZhbHNlKSkpO1xyXG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoaXMudW5kZWZpbmVkKGlkKSAmJiAhZm9yY2VQdXJnZSkgLy8gaWQgaXMgdW5kZWZpbmVkXHJcbiAgICAgICAgICAgICAgICAgICAgcXVlcnkud2hlcmUodGFibGVbZGtdLmVxKGZhbHNlKSk7XHJcbiAgICAgICAgICAgIH0gICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jb250ZXh0LmV4ZWMocXVlcnkpOy8vcXVlcnkuZXhlYygpO1xyXG4gICAgICAgIH1cclxuICAgIFxyXG4gICAgICAgIHB1YmxpYyBxdWVyeSggY29udGV4dDogKGN0eDpFX0NUWCwgcXVlcnk6REJRdWVyeTxUPik9PmFueSApOiBQcm9taXNlPFRbXT4ge1xyXG4gICAgICAgICAgICB2YXIgZGIgPSB0aGlzLmNvbnRleHQuZGI7XHJcbiAgICAgICAgICAgIHZhciB0YWJsZSA9IHRoaXMuY29udGV4dC50YWJsZVNjaGVtYU1hcFt0aGlzLnRhYmxlTmFtZV07XHJcbiAgICAgICAgICAgIHZhciBxdWVyeSA9IHRoaXMuX3F1ZXJ5KGRiLHRhYmxlKTsgICAgXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm4gY29udGV4dCg8RV9DVFg+dGhpcy50YmxtYXAsIFxyXG4gICAgICAgICAgICAgICAgbmV3IFF1ZXJ5U2VydmljZTxUPihxdWVyeSx0aGlzLmNvbnRleHQsIHRoaXMudGFibGVOYW1lLCB0aGlzLmZrbWFwLCB0aGlzLnRibG1hcCkpOyAgICAgICAgICAgICAgICBcclxuICAgIFxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBwdWJsaWMgY291bnQoIGNvbnRleHQ6IChjdHg6RV9DVFgsIHF1ZXJ5OkRCQ291bnQ8VD4pPT5hbnkgKTogUHJvbWlzZTxudW1iZXI+IHtcclxuICAgICAgICAgICAgdmFyIGRiID0gdGhpcy5jb250ZXh0LmRiO1xyXG4gICAgICAgICAgICB2YXIgdGFibGUgPSB0aGlzLmNvbnRleHQudGFibGVTY2hlbWFNYXBbdGhpcy50YWJsZU5hbWVdOyAgICAgXHJcbiAgICAgICAgICAgIHZhciBwayA9IHRoaXMuY29udGV4dC5kYkluc3RhbmNlLnBrW3RoaXMudGFibGVOYW1lXTtcclxuICAgICAgICAgICAgdmFyIHF1ZXJ5ID0gdGhpcy5fcXVlcnkoZGIsdGFibGUsIFtsZi5mbi5jb3VudCh0YWJsZVtwa10pXSk7ICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm4gY29udGV4dCg8RV9DVFg+dGhpcy50YmxtYXAsIFxyXG4gICAgICAgICAgICAgICAgbmV3IENvdW50U2VydmljZTxUPihxdWVyeSx0aGlzLmNvbnRleHQsIHRoaXMudGFibGVOYW1lLCB0aGlzLmZrbWFwLCB0aGlzLnRibG1hcCkpOyAgICAgICAgICAgICAgICBcclxuICAgIFxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBwdWJsaWMgc2VsZWN0KCBjb250ZXh0OiAoY3R4OlRfQ1RYLCBxdWVyeTpEQlF1ZXJ5PFQ+KT0+YW55ICk6IFByb21pc2U8VFtdPiB7XHJcbiAgICAgICAgICAgIHZhciBkYiA9IHRoaXMuY29udGV4dC5kYjtcclxuICAgICAgICAgICAgdmFyIHRhYmxlID0gdGhpcy5jb250ZXh0LnRhYmxlU2NoZW1hTWFwW3RoaXMudGFibGVOYW1lXTsgICAgIFxyXG4gICAgICAgICAgICB2YXIgcXVlcnkgPSB0aGlzLl9xdWVyeShkYix0YWJsZSx1bmRlZmluZWQsZmFsc2UpOyAgICBcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgcmV0dXJuIGNvbnRleHQoPFRfQ1RYPnRoaXMudGJsbWFwW3RoaXMudGFibGVOYW1lXSwgXHJcbiAgICAgICAgICAgICAgICBuZXcgU2VsZWN0U2VydmljZTxUPihxdWVyeSx0aGlzLmNvbnRleHQsIHRoaXMudGFibGVOYW1lLCB0aGlzLmZrbWFwLCB0aGlzLnRibG1hcCkpOyAgICAgICAgICAgICAgICBcclxuICAgIFxyXG4gICAgICAgIH0gICAgXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIC8vIHVzZWQgYnkgYm90aCBnZXQgYW5kIHF1ZXJ5XHJcbiAgICAgICAgcHJpdmF0ZSBfcXVlcnkoZGI6IGxmLkRhdGFiYXNlLCB0YWJsZTogbGYuc2NoZW1hLlRhYmxlLCBjb2x1bW5zPzogbGYuc2NoZW1hLkNvbHVtbltdLCBqb2luTmF2VGFibGVzPzogYm9vbGVhbikgOiBsZi5xdWVyeS5TZWxlY3RcclxuICAgICAgICB7ICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoam9pbk5hdlRhYmxlcz09PXVuZGVmaW5lZCkgam9pbk5hdlRhYmxlcz10cnVlOyBcclxuICAgICAgICAgICAgLy8gZXhlY3V0ZSBxdWVyeSAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgcXVlcnkgPSBjb2x1bW5zID8gZGIuc2VsZWN0KC4uLmNvbHVtbnMpLmZyb20odGFibGUpIDogZGIuc2VsZWN0KCkuZnJvbSh0YWJsZSk7XHJcbiAgICAgICAgICAgIGlmIChqb2luTmF2VGFibGVzKXtcclxuICAgICAgICAgICAgICAgIGZvciAodmFyIGk9MDsgaTwgdGhpcy5qb2luLmxlbmd0aDsgaSsrKXtcclxuICAgICAgICAgICAgICAgICAgICBxdWVyeS5pbm5lckpvaW4odGhpcy5qb2luW2ldLnRhYmxlLCB0aGlzLmpvaW5baV0ucHJlZGljYXRlbGVmdC5lcSh0aGlzLmpvaW5baV0ucHJlZGljYXRlcmlnaHQpKSAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiBxdWVyeTsgICAgICAgIFxyXG4gICAgICAgICAgICBcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy9wdWJsaWMgcHVyZ2UoKTogUHJvbWlzZTxhbnk+IHtcclxuICAgICAgICAvLyAgICByZXR1cm4gdGhpcy5kZWxldGUodW5kZWZpbmVkLCB0cnVlKTtcclxuICAgICAgICAvL31cclxuICAgICAgICBwdWJsaWMgZGVsZXRlKGlkOiBhbnksIGZvcmNlUHVyZ2U/OmJvb2xlYW4pOiBQcm9taXNlPGFueT4ge1xyXG4gICAgXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9nZXQoaWQsIGZvcmNlUHVyZ2UpLnRoZW4ocmVzdWx0cz0+e1xyXG4gICAgXHJcbiAgICAgICAgICAgICAgICAvLyBkaXN0aW5jdCAgLSBmbGF0dGVuIGFuZCByZW1vdmUgZHVwbGljYXRlcyByZXN1bHRpbmcgZm9yIGpvaW5zXHJcbiAgICAgICAgICAgICAgICB2YXIgbWFwID0ge307ICBcclxuICAgICAgICAgICAgICAgIHZhciBrZXlzID0ge307ICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpPTA7IGk8cmVzdWx0cy5sZW5ndGg7IGkrKyl7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIHJlc3VsdCA9IHJlc3VsdHNbaV07ICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGZvciAodmFyIHRhYmxlIGluIHJlc3VsdCl7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBwayA9IHRoaXMuY29udGV4dC5kYkluc3RhbmNlLnBrW3RhYmxlXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHJvdyA9IHJlc3VsdFt0YWJsZV07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBrZXkgPSByb3dbcGtdO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGtleXNbdGFibGVdPT09dW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBrZXlzW3RhYmxlXSA9IFsga2V5IF07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXBbdGFibGVdID0gWyByb3cgXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChrZXlzW3RhYmxlXS5pbmRleE9mKGtleSkgPT09IC0xKXtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBrZXlzW3RhYmxlXS5wdXNoKCBrZXkgKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXBbdGFibGVdLnB1c2goIHJvdyApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAvLyBkZWxldGUgb3IgZmxhZyBkZXBlbmRpbmcgb24gc2V0dGluZ3NcclxuICAgICAgICAgICAgICAgIHZhciBkYiA9IHRoaXMuY29udGV4dC5kYjtcclxuICAgICAgICAgICAgICAgIHZhciBxcSA9IFtdO1xyXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgdGFibGVOYW1lIGluIG1hcCl7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIHBrID0gdGhpcy5jb250ZXh0LmRiSW5zdGFuY2UucGtbdGFibGVOYW1lXTtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgdGFibGUgPSB0aGlzLnRibG1hcFt0YWJsZU5hbWVdO1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBrZXlMaXN0ID0ga2V5c1t0YWJsZU5hbWVdO1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIHZhciBkayA9IHRoaXMuY29udGV4dC5kYkluc3RhbmNlLm9wdGlvbnNbdGFibGVOYW1lXVsnaXNkZWxldGVkJ107IFxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChkaz09PSB1bmRlZmluZWQgfHwgZm9yY2VQdXJnZT09PSB0cnVlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBxPSBkYi5kZWxldGUoKS5mcm9tKHRhYmxlKS53aGVyZSh0YWJsZVtwa10uaW4oa2V5TGlzdCkpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHFxLnB1c2gocSk7ICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy9xLnB1c2goZGIuZGVsZXRlKCkuZnJvbSh0YWJsZSkud2hlcmUodGFibGVbcGtdLmluKGtleUxpc3QpKS5leGVjKCkpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBlbHNle1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgcSA9IGRiLnVwZGF0ZSh0YWJsZSkuc2V0KHRhYmxlW2RrXSx0cnVlKS53aGVyZSh0YWJsZVtwa10uaW4oa2V5TGlzdCkpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHFxLnB1c2gocSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vcS5wdXNoKGRiLnVwZGF0ZSh0YWJsZSkuc2V0KHRhYmxlW2RrXSx0cnVlKS53aGVyZSh0YWJsZVtwa10uaW4oa2V5TGlzdCkpLmV4ZWMoKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29udGV4dC5leGVjTWFueShxcSk7XHJcbiAgICAgICAgICAgICAgICAvL3JldHVybiBQcm9taXNlLmFsbChwcm9taXNlcyk7ICAgIFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9ICAgIFxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjbGFzcyBRdWVyeVNlcnZpY2VCYXNlPFQ+IHtcclxuICAgICAgICBwcm90ZWN0ZWQgcXVlcnk6IGxmLnF1ZXJ5LlNlbGVjdDsgXHJcbiAgICAgICAgcHJvdGVjdGVkIGNvbnRleHQ6IERCQ29udGV4dEludGVybmFsO1xyXG4gICAgICAgIHByb3RlY3RlZCB0YWJsZU5hbWU6IHN0cmluZztcclxuICAgICAgICBwcm90ZWN0ZWQgZmttYXA6IE9iamVjdDtcclxuICAgICAgICBwcm90ZWN0ZWQgdGJsbWFwOiBPYmplY3Q7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAvL3doZXJlKHByZWRpY2F0ZTogUHJlZGljYXRlKTogU2VsZWN0XHJcbiAgICAgICAgcHVibGljIHdoZXJlKHByZWRpY2F0ZTogbGYuUHJlZGljYXRlKTogUXVlcnlTZXJ2aWNlQmFzZTxUPiB7XHJcbiAgICAgICAgICAgIHZhciB0YWJsZSA9IHRoaXMudGJsbWFwW3RoaXMudGFibGVOYW1lXTtcclxuICAgICAgICAgICAgdmFyIGRrID0gdGhpcy5jb250ZXh0LmRiSW5zdGFuY2Uub3B0aW9uc1t0aGlzLnRhYmxlTmFtZV1bJ2lzZGVsZXRlZCddOyBcclxuICAgICAgICAgICAgaWYgKGRrID09PSB1bmRlZmluZWQpe1xyXG4gICAgICAgICAgICAgICAgdGhpcy5xdWVyeS53aGVyZShwcmVkaWNhdGUpOyAgICAgICAgICAgXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnF1ZXJ5LndoZXJlKGxmLm9wLmFuZChwcmVkaWNhdGUsdGFibGVbZGtdLmVxKGZhbHNlKSkpO1xyXG4gICAgICAgICAgICB9ICAgICAgICBcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICAgICAgfSAgXHJcbiAgICAgICAgXHJcbiAgICAgICAgLy9iaW5kKC4uLnZhbHVlczogYW55W10pOiBCdWlsZGVyXHJcbiAgICAgICAgXHJcbiAgICAgICAgLy9leHBsYWluKCk6IHN0cmluZ1xyXG4gICAgICAgIHB1YmxpYyBleHBsYWluKCk6c3RyaW5nIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMucXVlcnkuZXhwbGFpbigpO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvL3RvU3FsKCk6IHN0cmluZ1xyXG4gICAgICAgIHB1YmxpYyB0b1NxbCgpOnN0cmluZyB7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnF1ZXJ5LnRvU3FsKCk7XHJcbiAgICAgICAgfSAgICAgICAgXHJcbiAgICB9XHJcbiAgICBjbGFzcyBDb3VudFNlcnZpY2U8VD4gZXh0ZW5kcyBRdWVyeVNlcnZpY2VCYXNlPFQ+IGltcGxlbWVudHMgREJDb3VudDxUPiB7XHJcbiAgICBcclxuICAgICAgICBjb25zdHJ1Y3RvcihcclxuICAgICAgICAgICAgcHJvdGVjdGVkIHF1ZXJ5OiBsZi5xdWVyeS5TZWxlY3QsIFxyXG4gICAgICAgICAgICBwcm90ZWN0ZWQgY29udGV4dDogREJDb250ZXh0SW50ZXJuYWwsXHJcbiAgICAgICAgICAgIHByb3RlY3RlZCB0YWJsZU5hbWU6IHN0cmluZyxcclxuICAgICAgICAgICAgcHJvdGVjdGVkIGZrbWFwOiBPYmplY3QsXHJcbiAgICAgICAgICAgIHByb3RlY3RlZCB0YmxtYXA6IE9iamVjdCl7XHJcbiAgICAgICAgICAgICAgICBzdXBlcigpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIHB1YmxpYyB3aGVyZShwcmVkaWNhdGU6IGxmLlByZWRpY2F0ZSk6IENvdW50U2VydmljZTxUPiB7XHJcbiAgICAgICAgICAgIHN1cGVyLndoZXJlKHByZWRpY2F0ZSk7ICAgICAgICBcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXM7IFxyXG4gICAgICAgIH0gICAgICAgIFxyXG4gICAgICAgIHB1YmxpYyBleGVjKCkgOiBudW1iZXIgeyAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBwayA9IHRoaXMuY29udGV4dC5kYkluc3RhbmNlLnBrW3RoaXMudGFibGVOYW1lXTtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29udGV4dC5leGVjKHRoaXMucXVlcnkpLnRoZW4oKHJlc3VsdHMpPT57ICAgIFxyXG4gICAgICAgICAgICAgICAgdmFyIGNvdW50ID0gcmVzdWx0c1swXVt0aGlzLnRhYmxlTmFtZV1bYENPVU5UKCR7cGt9KWBdO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvdW50O1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9ICAgICAgICBcclxuICAgIH1cclxuICAgIGNsYXNzIFF1ZXJ5U2VydmljZTxUPiBleHRlbmRzIFF1ZXJ5U2VydmljZUJhc2U8VD4gaW1wbGVtZW50cyBEQlF1ZXJ5PFQ+IHtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdHJ1Y3RvcihcclxuICAgICAgICAgICAgcHJvdGVjdGVkIHF1ZXJ5OiBsZi5xdWVyeS5TZWxlY3QsIFxyXG4gICAgICAgICAgICBwcm90ZWN0ZWQgY29udGV4dDogREJDb250ZXh0SW50ZXJuYWwsXHJcbiAgICAgICAgICAgIHByb3RlY3RlZCB0YWJsZU5hbWU6IHN0cmluZyxcclxuICAgICAgICAgICAgcHJvdGVjdGVkIGZrbWFwOiBPYmplY3QsXHJcbiAgICAgICAgICAgIHByb3RlY3RlZCB0YmxtYXA6IE9iamVjdCl7XHJcbiAgICAgICAgICAgICAgICBzdXBlcigpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvL2dyb3VwQnkoLi4uY29sdW1uczogc2NoZW1hLkNvbHVtbltdKTogU2VsZWN0XHJcbiAgICAgICAgXHJcbiAgICAgICAgcHVibGljIGdyb3VwQnkoLi4uY29sdW1uczogbGYuc2NoZW1hLkNvbHVtbltdKTogUXVlcnlTZXJ2aWNlPFQ+IHtcclxuICAgICAgICAgICAgdGhpcy5xdWVyeS5ncm91cEJ5LmFwcGx5KHRoaXMsY29sdW1ucyk7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzOyAgICAgICAgXHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vbGltaXQobnVtYmVyT2ZSb3dzOiBCaW5kZXJ8bnVtYmVyKTogU2VsZWN0XHJcbiAgICAgICAgcHVibGljIGxpbWl0KG51bWJlck9mUm93czogbGYuQmluZGVyfG51bWJlcik6IFF1ZXJ5U2VydmljZTxUPntcclxuICAgICAgICAgICAgdGhpcy5xdWVyeS5saW1pdChudW1iZXJPZlJvd3MpO1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcztcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy9vcmRlckJ5KGNvbHVtbjogc2NoZW1hLkNvbHVtbiwgb3JkZXI/OiBPcmRlcik6IFNlbGVjdFxyXG4gICAgICAgIHB1YmxpYyBvcmRlckJ5KGNvbHVtbjogbGYuc2NoZW1hLkNvbHVtbiwgb3JkZXI/OiBsZi5PcmRlcik6IFF1ZXJ5U2VydmljZTxUPiB7XHJcbiAgICAgICAgICAgIHRoaXMucXVlcnkub3JkZXJCeShjb2x1bW4sIG9yZGVyKTtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vc2tpcChudW1iZXJPZlJvd3M6IEJpbmRlcnxudW1iZXIpOiBTZWxlY3RcclxuICAgICAgICBwdWJsaWMgc2tpcChudW1iZXJPZlJvd3M6IGxmLkJpbmRlcnxudW1iZXIpOiBRdWVyeVNlcnZpY2U8VD4ge1xyXG4gICAgICAgICAgICB0aGlzLnF1ZXJ5LnNraXAobnVtYmVyT2ZSb3dzKTtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgXHJcbiAgICAgICAgcHVibGljIHdoZXJlKHByZWRpY2F0ZTogbGYuUHJlZGljYXRlKTogUXVlcnlTZXJ2aWNlPFQ+IHtcclxuICAgICAgICAgICAgc3VwZXIud2hlcmUocHJlZGljYXRlKTsgICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm4gdGhpczsgXHJcbiAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgLy9leGVjKCk6IFByb21pc2U8QXJyYXk8T2JqZWN0Pj5cclxuICAgICAgICBwdWJsaWMgZXhlYygpIDogUHJvbWlzZTxUW10+IHtcclxuICAgICAgICAgICAgLy9yZXR1cm4gdGhpcy5xdWVyeS5leGVjKCkudGhlbigocmVzdWx0cyk9PntcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29udGV4dC5leGVjKHRoaXMucXVlcnkpLnRoZW4oKHJlc3VsdHMpPT57ICAgIFxyXG4gICAgICAgICAgICAgICAgdmFyIGVudGl0aWVzID0gdGhpcy5jb250ZXh0LmNvbXBvc2UodGhpcy50YWJsZU5hbWUsIHJlc3VsdHMsIHRoaXMuZmttYXApO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGVudGl0aWVzO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGNsYXNzIFNlbGVjdFNlcnZpY2U8VD4gZXh0ZW5kcyBRdWVyeVNlcnZpY2VCYXNlPFQ+IGltcGxlbWVudHMgREJRdWVyeTxUPiB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3RydWN0b3IoXHJcbiAgICAgICAgICAgIHByb3RlY3RlZCBxdWVyeTogbGYucXVlcnkuU2VsZWN0LCBcclxuICAgICAgICAgICAgcHJvdGVjdGVkIGNvbnRleHQ6IERCQ29udGV4dEludGVybmFsLFxyXG4gICAgICAgICAgICBwcm90ZWN0ZWQgdGFibGVOYW1lOiBzdHJpbmcsXHJcbiAgICAgICAgICAgIHByb3RlY3RlZCBma21hcDogT2JqZWN0LFxyXG4gICAgICAgICAgICBwcm90ZWN0ZWQgdGJsbWFwOiBPYmplY3Qpe1xyXG4gICAgICAgICAgICAgICAgc3VwZXIoKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy9ncm91cEJ5KC4uLmNvbHVtbnM6IHNjaGVtYS5Db2x1bW5bXSk6IFNlbGVjdFxyXG4gICAgICAgIFxyXG4gICAgICAgIHB1YmxpYyBncm91cEJ5KC4uLmNvbHVtbnM6IGxmLnNjaGVtYS5Db2x1bW5bXSk6IFNlbGVjdFNlcnZpY2U8VD4ge1xyXG4gICAgICAgICAgICB0aGlzLnF1ZXJ5Lmdyb3VwQnkuYXBwbHkodGhpcyxjb2x1bW5zKTtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXM7ICAgICAgICBcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy9saW1pdChudW1iZXJPZlJvd3M6IEJpbmRlcnxudW1iZXIpOiBTZWxlY3RcclxuICAgICAgICBwdWJsaWMgbGltaXQobnVtYmVyT2ZSb3dzOiBsZi5CaW5kZXJ8bnVtYmVyKTogU2VsZWN0U2VydmljZTxUPntcclxuICAgICAgICAgICAgdGhpcy5xdWVyeS5saW1pdChudW1iZXJPZlJvd3MpO1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcztcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy9vcmRlckJ5KGNvbHVtbjogc2NoZW1hLkNvbHVtbiwgb3JkZXI/OiBPcmRlcik6IFNlbGVjdFxyXG4gICAgICAgIHB1YmxpYyBvcmRlckJ5KGNvbHVtbjogbGYuc2NoZW1hLkNvbHVtbiwgb3JkZXI/OiBsZi5PcmRlcik6IFNlbGVjdFNlcnZpY2U8VD4ge1xyXG4gICAgICAgICAgICB0aGlzLnF1ZXJ5Lm9yZGVyQnkoY29sdW1uLCBvcmRlcik7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvL3NraXAobnVtYmVyT2ZSb3dzOiBCaW5kZXJ8bnVtYmVyKTogU2VsZWN0XHJcbiAgICAgICAgcHVibGljIHNraXAobnVtYmVyT2ZSb3dzOiBsZi5CaW5kZXJ8bnVtYmVyKTogU2VsZWN0U2VydmljZTxUPiB7XHJcbiAgICAgICAgICAgIHRoaXMucXVlcnkuc2tpcChudW1iZXJPZlJvd3MpO1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcztcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICBcclxuICAgICAgICBwdWJsaWMgd2hlcmUocHJlZGljYXRlOiBsZi5QcmVkaWNhdGUpOiBTZWxlY3RTZXJ2aWNlPFQ+IHtcclxuICAgICAgICAgICAgc3VwZXIud2hlcmUocHJlZGljYXRlKTsgICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm4gdGhpczsgXHJcbiAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgLy9leGVjKCk6IFByb21pc2U8QXJyYXk8T2JqZWN0Pj5cclxuICAgICAgICBwdWJsaWMgZXhlYygpIDogUHJvbWlzZTxUW10+IHtcclxuICAgICAgICAgICAgLy9yZXR1cm4gdGhpcy5xdWVyeS5leGVjKCkudGhlbigocmVzdWx0cyk9PntcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29udGV4dC5leGVjKHRoaXMucXVlcnkpLnRoZW4oKHJlc3VsdHMpPT57ICAgIFxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdHM7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgLy8gZ2VuZXJhbCBwdXJwb3MgaGVscGVyc1xyXG4gICAgZXhwb3J0IGNsYXNzIGlzIHtcclxuICAgICAgICBwdWJsaWMgc3RhdGljIGFycmF5KHg6YW55KXtcclxuICAgICAgICAgICAgcmV0dXJuIEFycmF5LmlzQXJyYXkoeCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHB1YmxpYyBzdGF0aWMgbnVtYmVyKHg6YW55KXtcclxuICAgICAgICAgICAgcmV0dXJuICh0eXBlb2YoeCk9PT0nbnVtYmVyJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHB1YmxpYyBzdGF0aWMgc3RyaW5nKHg6YW55KXtcclxuICAgICAgICAgICAgcmV0dXJuICh0eXBlb2YoeCk9PT0nc3RyaW5nJyk7XHJcbiAgICAgICAgfSAgICBcclxuICAgICAgICBwdWJsaWMgc3RhdGljIG9iamVjdCh4OmFueSl7XHJcbiAgICAgICAgICAgIHJldHVybiAodHlwZW9mKHgpPT09J29iamVjdCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBwdWJsaWMgc3RhdGljIHVuZGVmaW5lZCh4OmFueSl7XHJcbiAgICAgICAgICAgIHJldHVybiB4ID09PSB1bmRlZmluZWQ7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBleHBvcnQgY2xhc3MgU3RyaW5nVXRpbHMge1xyXG4gICAgICAgIHB1YmxpYyBzdGF0aWMgcmVtb3ZlV2hpdGVTcGFjZShzdHI6IHN0cmluZykgOiBzdHJpbmcge1xyXG4gICAgICAgICAgICByZXR1cm4gc3RyLnJlcGxhY2UoL1xccy9nLCBcIlwiKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGV4cG9ydCBjbGFzcyBQcm9taXNlVXRpbHMge1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIGV4ZWN1dGUgZnVuY3Rpb25zIHJldHVybmluZyBwcm9taXNlcyBzZXF1ZW50aWFsbHlcclxuICAgICAgICBwdWJsaWMgc3RhdGljIHNlcmlhbCguLi5pdGVtczogYW55W11bXSkge1xyXG4gICAgICAgICAgICBpZiAoaXRlbXMubGVuZ3RoID09PTEpIGl0ZW1zID0gaXRlbXNbMF07XHJcbiAgICAgICAgICAgIGl0ZW1zLnJldmVyc2UoKTsgLy8gcmV2ZXJzZSBzbyB0aGF0IHBvcHMgY29tZSBvZmYgb2YgdGhlIGJvdHRvbSBpbnN0ZWFkIG9mIHRoZSB0b3AuICAgIFxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLHJlamVjdCk9PntcclxuICAgICAgICAgICAgICAgIF9zZXF1ZW5jZShpdGVtcywgcmVzb2x2ZSwgcmVqZWN0KTsgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgZnVuY3Rpb24gX3NlcXVlbmNlKGl0ZW1zOiBhbnlbXVtdLCByZXNvbHZlLCByZWplY3QgKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgZCA9IGl0ZW1zLnBvcCgpOyAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaWYgKGQpe1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBmbiA6ICguLi5hcmdzOmFueVtdKSA9PiBQcm9taXNlPGFueT4gPSBkLnNwbGljZSgwLDEpWzBdO1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBhcmdzID0gZDsgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGZuLmFwcGx5KHRoaXMsYXJncykudGhlbigoKT0+eyBfc2VxdWVuY2UoaXRlbXMsIHJlc29sdmUscmVqZWN0KTt9KVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSAgICBcclxuICAgIH1cclxuICAgIFxyXG4gICAgZXhwb3J0IGNsYXNzIExvYWQge1xyXG4gICAgICAgIHByaXZhdGUgc3RhdGljIGNhY2hlID0ge307XHJcbiAgICAgICAgXHJcbiAgICAgICAgcHVibGljIHN0YXRpYyBqc29uKHVybDogc3RyaW5nLCBhc3luYz86IGJvb2xlYW4sIGNhY2hlPzpib29sZWFuKSA6IGFueSB7ICAgICAgICBcclxuICAgIFxyXG4gICAgICAgICAgICBpZiAoY2FjaGUpe1xyXG4gICAgICAgICAgICAgICAgdmFyIGNhY2hlZFJlc3BvbnNlID0gdGhpcy5jYWNoZVt1cmxdO1xyXG4gICAgICAgICAgICAgICAgaWYgKGNhY2hlZFJlc3BvbnNlKXtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoYXN5bmMpe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUscmVqZWN0KT0+e1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShKU09OLnBhcnNlKGNhY2hlZFJlc3BvbnNlKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShjYWNoZWRSZXNwb25zZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgeG1saHR0cCA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xyXG4gICAgICAgICAgICB4bWxodHRwLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgIGlmICh4bWxodHRwLnJlYWR5U3RhdGUgPT0gNCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChhc3luYykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoeG1saHR0cC5zdGF0dXMgPT0gMjAwKXtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNhY2hlKSB0aGlzLmNhY2hlW3VybF0gPSB4bWxodHRwLnJlc3BvbnNlVGV4dDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSxyZWplY3QpPT57XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShKU09OLnBhcnNlKGNhY2hlZFJlc3BvbnNlKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTsgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUscmVqZWN0KT0+e1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdCh4bWxodHRwLnN0YXR1cyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTsgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgeG1saHR0cC5vcGVuKFwiR0VUXCIsIHVybCwgYXN5bmMpO1xyXG4gICAgICAgICAgICB4bWxodHRwLnNlbmQoKTtcclxuICAgICAgICAgICAgaWYgKCFhc3luYyl7XHJcbiAgICAgICAgICAgICAgICBpZiAoeG1saHR0cC5zdGF0dXMgPT0gMjAwKXtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoY2FjaGUpIHRoaXMuY2FjaGVbdXJsXSA9IHhtbGh0dHAucmVzcG9uc2VUZXh0O1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBKU09OLnBhcnNlKHhtbGh0dHAucmVzcG9uc2VUZXh0KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGVsc2V7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHhtbGh0dHAuc3RhdHVzO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSAgICBcclxuICAgIH1cclxufVxyXG5leHBvcnQgPSB3ZWJlZjsiXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=
