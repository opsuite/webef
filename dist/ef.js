define(["require", "exports", 'google/lovefield'], function (require, exports) {
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
        function DBContext(dbName, dbStoreType) {
            var _this = this;
            this.loading = false;
            this.loaded = false;
            this.context = new DBContextInternal();
            this.context.dbStoreType = dbStoreType || lf.schema.DataStoreType.WEB_SQL;
            this.context.dbInstance = DBSchemaInternal.instanceMap[dbName];
            this.ready = new Promise(function (resolve, reject) {
                try {
                    _this.context.dbInstance.schemaBuilder.connect({ storeType: _this.context.dbStoreType })
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
            var key = fkmap[table].column2;
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
            var table = this.context.tableSchemaMap[this.tableName]; //db.getSchema().table(this.tableName);         
            var query = this._query(db, table);
            return context(this.tblmap, new QueryService(query, this.context, this.tableName, this.fkmap, this.tblmap));
        };
        // used by both get and query
        DBEntityInternal.prototype._query = function (db, table) {
            // execute query            
            var query = db.select().from(table);
            for (var i = 0; i < this.join.length; i++) {
                query.innerJoin(this.join[i].table, this.join[i].predicateleft.eq(this.join[i].predicateright));
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
    var QueryService = (function () {
        function QueryService(query, context, tableName, fkmap, tblmap) {
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
        //where(predicate: Predicate): Select
        QueryService.prototype.where = function (predicate) {
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
        QueryService.prototype.explain = function () {
            return this.query.explain();
        };
        //toSql(): string
        QueryService.prototype.toSql = function () {
            return this.query.toSql();
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
    })();
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
});
