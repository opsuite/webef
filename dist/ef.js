define(["require","exports","google/lovefield"],function(t,e){var n=function(){function t(){}return t.create=function(){for(var t=[],e=0;e<arguments.length;e++)t[e-0]=arguments[e];var n,i,o;if(3===t.length)n=t[0],i=t[1],o=t[2];else if(1===t.length){var s=p.json(t[0]);n=s.name,i=s.version,o=s.schema}var c=lf.schema.create(n,i),l={},u={},f={},d={},m=[],b={};for(var v in o){var x=o[v],y=c.createTable(v);m.push(v);var g=[],N=[];l[v]=[],u[v]={},f[v]={},b[v]={};var T=[];for(var k in x){var S=h.removeWhiteSpace(x[k]),I=!0,w=!1;if(0===S.indexOf("pkey"))y.addColumn(k,lf.Type.INTEGER),w=!0,T.push(k),d[v]=k;else if(0===S.indexOf("string"))y.addColumn(k,lf.Type.STRING);else if(0===S.indexOf("date"))y.addColumn(k,lf.Type.DATE_TIME);else if(0===S.indexOf("boolean"))y.addColumn(k,lf.Type.BOOLEAN);else if(0===S.indexOf("int"))y.addColumn(k,lf.Type.INTEGER);else if(0===S.indexOf("float"))y.addColumn(k,lf.Type.NUMBER);else if(0===S.indexOf("object"))y.addColumn(k,lf.Type.OBJECT);else if(0===S.indexOf("array"))y.addColumn(k,lf.Type.ARRAY_BUFFER);else if(0===S.indexOf("fkey")){y.addColumn(k,lf.Type.INTEGER),g.push(k);var O=S.split(":")[1].split(".");f[v][k]={columnName:k,fkTable:O[0],fkColumn:O[1]}}else if(0==S.indexOf("nav->")){I=!1;var O=S.split(">")[1].split(":"),M=O[1].split("."),_=O[0],q=M[0],E=M[1];u[v][k]={columnName:k,tableName:_,fkTable:q,fkColumn:E,isArray:q===_}}else 0===S.indexOf("dbtimestamp")?(y.addColumn(k,lf.Type.INTEGER),b[v].dbtimestamp=k):0===S.indexOf("isdeleted")&&(y.addColumn(k,lf.Type.BOOLEAN),b[v].isdeleted=k);if(I){var C=S.split(",");if(-1!==C.indexOf("index")){-1!==C.indexOf("unique");N.push(k)}-1!==C.indexOf("null")&&g.push(k),l[v].push(k)}}if(0===T.length)throw"Schema Error: no primary key was specified for table '"+v+"'";if(T.length>1)throw"Schema Error: more than one primary key was specified for table '"+v+"'";y.addPrimaryKey(T),y.addNullable(g),y.addIndex("ix_"+v,N)}a.instanceMap[n]=new r(n,i,c,l,u,m,f,b,d)},t}();e.DBSchema=n;var a=function(){function t(){}return t.instanceMap={},t}(),r=function(){function t(t,e,n,a,r,i,o,s,c){this.dbName=t,this.dbVersion=e,this.schemaBuilder=n,this.schema=a,this.nav=r,this.tables=i,this.fk=o,this.options=s,this.pk=c}return t.prototype.newTableMap=function(){for(var t={},e=0;e<this.tables.length;e++)t[this.tables[e]]=[];return t},t}(),i=function(){function t(t,e){var n=this;this.loading=!1,this.loaded=!1,this.context=new o,this.context.dbStoreType=e||lf.schema.DataStoreType.WEB_SQL,this.context.dbInstance=a.instanceMap[t],this.ready=new Promise(function(t,e){try{n.context.dbInstance.schemaBuilder.connect({storeType:n.context.dbStoreType}).then(function(e){n.context.db=e,n.context.tableSchemaMap=n.context.dbInstance.newTableMap(),n.context.tables=[];for(var a in n.context.tableSchemaMap){var r=n.context.db.getSchema().table(a);n.context.tableSchemaMap[a]=r,n.context.tables.push(r)}t()})}catch(a){e(a)}})}return t.prototype.purge=function(){var t=this.context.db.createTransaction(),e=[];for(var n in this.context.tableSchemaMap){var a=this.context.tableSchemaMap[n];e.push(this.context.db["delete"]().from(a)),this.context.purgeKeys(n)}return this.context.purgeKeys("dbtimestamp"),t.exec(e)},t.prototype.transaction=function(t){var e=this;return this.context.tx=this.context.db.createTransaction(),this.context.tx.begin(this.context.tables).then(function(){var n=t(e.context.tx,e.context.tableSchemaMap).then(function(){e.context.tx.commit(),e.context.tx=void 0});return n})},Object.defineProperty(t.prototype,"tables",{get:function(){return this.context.tableSchemaMap},enumerable:!0,configurable:!0}),t.prototype.select=function(){for(var t=[],e=0;e<arguments.length;e++)t[e-0]=arguments[e];return this.context.db.select.apply(this.context.db,t)},t.prototype.DBEntity=function(t,e){return new s(this.context,t,e,this.ready)},t}();e.DBContext=i;var o=function(){function t(){}return t.prototype.compose=function(t,e,n){for(var a=n[t].column2,r=[],i=[],o={},s=0;s<e.length;s++){var c=e[s],l=c[t][a];if(void 0===o[l]){o[l]=r.length;var h=c[t],u=JSON.parse(JSON.stringify(h));r.push(u)}var p=o[l];void 0===i[p]&&(i[p]=[]),i[p].push(c)}for(var f in o){var d=o[f];e=i[d];for(var m=0;m<e.length;m++){var b=JSON.parse(JSON.stringify(e[m]));this.compose_(t,b,r[d])}}return r},t.prototype.compose_=function(t,e,n){var a=this.dbInstance.nav[t];for(var r in a){var i=a[r],o=e[i.tableName];i.isArray?void 0===n[i.columnName]?n[i.columnName]=[o]:n[i.columnName].push(o):n[i.columnName]=o,this.compose_(i.tableName,e,o)}},t.prototype.decompose=function(t,e){for(var n=this.dbInstance.newTableMap(),a=0;a<e.length;a++){var r=e[a];n[t].push(r),this.decompose_(t,r,n)}return n},t.prototype.decompose_=function(t,e,n){for(var a in e){var r=this.dbInstance.nav[t][a];if(void 0!==r){var i=e[a];if(l.array(i))for(var o=0;o<i.length;o++)n[r.tableName].push(i[o]),this.decompose_(r.tableName,i[o],n);else l.object(i)&&(n[r.tableName].push(i),this.decompose_(r.tableName,i,n))}}},t.prototype.allocateKeys=function(t,e){var n,a,r=""+this.dbInstance.dbName+this.dbStoreType+"."+t+".masterIndex",i=window.localStorage.getItem(r);return n=null===i?1:parseInt(i),a=n,e||(e=1),a+=e,window.localStorage.setItem(r,a.toString()),n},t.prototype.rollbackKeys=function(t,e){var n=""+this.dbInstance.dbName+this.dbStoreType+"."+t+".masterIndex";window.localStorage.setItem(n,(e-1).toString())},t.prototype.purgeKeys=function(t){var e=""+this.dbInstance.dbName+this.dbStoreType+"."+t+".masterIndex";localStorage.removeItem(e)},t.prototype.exec=function(t){return this.tx?this.tx.attach(t):t.exec()},t.prototype.execMany=function(t){if(this.tx)return t=t.reverse(),this._execMany(t);var e=this.db.createTransaction();return e.exec(t)},t.prototype._execMany=function(t){var e=this,n=t.pop(),a=this.tx.attach(n);return 0===t.length?a:a.then(function(){return e.execMany(t)})},t}(),s=function(){function t(t,e,n,a){var r=this;this.navigationProperties=[],this.navigationTables=[],this.tables=[],this.join=[],this.tblmap={},this.context=t,this.tableName=e,this.navigationProperties=n||[],this.nav=t.dbInstance.nav[e],this.pk=t.dbInstance.pk[e];for(var i in this.nav)this.navigationTables.push(this.nav[i].tableName);for(var o=0;o<this.navigationTables.length;o++)this.tables.push(this.navigationTables[o]);this.tables.push(this.tableName),this.fkmap={};for(var o=0;o<this.tables.length;o++){var e=this.tables[o],s=this.context.dbInstance.fk[e];for(var i in s){var c=s[i];-1!==this.tables.indexOf(c.fkTable)&&(this.fkmap[e]={table1:e,column1:i,table2:c.fkTable,column2:c.fkColumn},this.fkmap[c.fkTable]={table1:c.fkTable,column1:c.fkColumn,table2:e,column2:i})}}this.tables.sort(function(t,e){var n=r.fkmap[t],a=r.fkmap[e];return n.table2===e?-1:a.table2===t?1:0}),a.then(function(){var e=t.tableSchemaMap[r.tableName];for(var n in e)r[n]=e[n];r.tblmap[r.tableName]=e;for(var a=0;a<r.navigationTables.length;a++){var i=r.navigationTables[a];r.tblmap[i]=r.context.tableSchemaMap[i]}for(var a=0;a<r.navigationTables.length;a++){var i=r.navigationTables[a],o=r.fkmap[i],s={table:r.tblmap[i],predicateleft:r.tblmap[o.table2][o.column2],predicateright:r.tblmap[o.table1][o.column1]};r.join.push(s)}})}return t.prototype.put=function(t){var e,n=this;e=l.array(t)?t:[t];var a=this.context.decompose(this.tableName,e),r={};for(var i in a){var o=a[i];o.length>0&&(r[i]=this.put_calculateKeys(o,i))}for(var s=0;s<e.length;s++)this.put_calculateForeignKeys(this.tableName,e[s]);for(var c=[],s=0;s<this.tables.length;s++){var i=this.tables[s],o=a[i];o.length>0&&c.push(this.put_execute(o,i,this.context.db,r))}return this.context.execMany(c).then(function(t){var a=e.map(function(t,e,a){return t[n.pk]});return 1===a.length?a[0]:a},function(t){for(var e in a){var i=r[e];i&&(i.dbtsIndex&&n.context.rollbackKeys("dbtimestamp",i.dbtsIndex),n.context.rollbackKeys(e,i.index))}throw t})},t.prototype.put_calculateForeignKeys=function(t,e,n,a){function r(t,e,n,a,r,i){for(var o in a){var s=a[o];s.fkTable===r&&(e[o]=t[s.fkColumn])}for(var o in n){var s=n[o];s.fkTable===i&&(t[o]=e[s.fkColumn])}}for(var i in e){var o=this.context.dbInstance.nav[t][i];if(void 0!==o){var s=this.context.dbInstance.fk[o.tableName],c=this.context.dbInstance.fk[t],h=e[i];if(n=e,l.array(h))for(var u=0;u<h.length;u++)r(h[u],e,s,c,o.tableName,t),this.put_calculateForeignKeys(o.tableName,h[u],n,t);else l.object(h)&&(r(h,e,s,c,o.tableName,t),this.put_calculateForeignKeys(o.tableName,h,n,t))}}},t.prototype.put_calculateKeys=function(t,e){for(var n=this.context.dbInstance.pk[e],a=[],r=0;r<t.length;r++)void 0===t[r][n]&&a.push(r);for(var i=this.context.allocateKeys(e,a.length),r=0;r<a.length;r++)t[a[r]][n]=i+r;var o,s=this.context.dbInstance.options[e].dbtimestamp;if(s){o=this.context.allocateKeys("dbtimestamp",t.length);for(var r=0;r<t.length;r++)t[r][s]=o+r}var c=this.context.dbInstance.options[e].isdeleted;if(c)for(var r=0;r<t.length;r++)t[r][c]=!1;return{index:i,dbtsIndex:o}},t.prototype.put_execute=function(t,e,n,a){for(var r=this.context.tableSchemaMap[e],i=this.context.dbInstance.schema[e],o=[],s=0;s<t.length;s++){for(var c=t[s],l={},h=0;h<i.length;h++){var u=i[h];l[u]=c[u]}o.push(r.createRow(l))}var p=n.insertOrReplace().into(r).values(o);return p},t.prototype.get=function(t){var e=this;return this._get(t).then(function(n){var a=e.context.compose(e.tableName,n,e.fkmap);return l.array(t)||l.undefined(t)?a:a[0]})},t.prototype._get=function(t,e){var n=this.context.db,a=this.context.tableSchemaMap[this.tableName],r=this._query(n,a),i=this.context.dbInstance.pk[this.tableName],o=this.context.dbInstance.options[this.tableName].isdeleted;return void 0===o?l.array(t)?r.where(a[i]["in"](t)):l.number(t)&&r.where(a[i].eq(t)):l.array(t)?r.where(lf.op.and(a[i]["in"](t),a[o].eq(!1))):l.number(t)?r.where(lf.op.and(a[i].eq(t),a[o].eq(!1))):l.undefined(t)&&!e&&r.where(a[o].eq(!1)),this.context.exec(r)},t.prototype.query=function(t){var e=this.context.db,n=this.context.tableSchemaMap[this.tableName],a=this._query(e,n);return t(this.tblmap,new c(a,this.context,this.tableName,this.fkmap,this.tblmap))},t.prototype._query=function(t,e){for(var n=t.select().from(e),a=0;a<this.join.length;a++)n.innerJoin(this.join[a].table,this.join[a].predicateleft.eq(this.join[a].predicateright));return n},t.prototype["delete"]=function(t,e){var n=this;return this._get(t,e).then(function(t){for(var a={},r={},i=0;i<t.length;i++){var o=t[i];for(var s in o){var c=n.context.dbInstance.pk[s],l=o[s],h=l[c];void 0===r[s]?(r[s]=[h],a[s]=[l]):-1===r[s].indexOf(h)&&(r[s].push(h),a[s].push(l))}}var u=n.context.db,p=[];for(var f in a){var c=n.context.dbInstance.pk[f],s=n.tblmap[f],d=r[f],m=n.context.dbInstance.options[f].isdeleted;if(void 0===m||e===!0){var b=u["delete"]().from(s).where(s[c]["in"](d));p.push(b)}else{var b=u.update(s).set(s[m],!0).where(s[c]["in"](d));p.push(b)}}return n.context.execMany(p)})},t}(),c=function(){function t(t,e,n,a,r){this.query=t,this.context=e,this.tableName=n,this.fkmap=a,this.tblmap=r}return t.prototype.groupBy=function(){for(var t=[],e=0;e<arguments.length;e++)t[e-0]=arguments[e];return this.query.groupBy.apply(this,t),this},t.prototype.limit=function(t){return this.query.limit(t),this},t.prototype.orderBy=function(t,e){return this.query.orderBy(t,e),this},t.prototype.skip=function(t){return this.query.skip(t),this},t.prototype.where=function(t){var e=this.tblmap[this.tableName],n=this.context.dbInstance.options[this.tableName].isdeleted;return void 0===n?this.query.where(t):this.query.where(lf.op.and(t,e[n].eq(!1))),this},t.prototype.explain=function(){return this.query.explain()},t.prototype.toSql=function(){return this.query.toSql()},t.prototype.exec=function(){var t=this;return this.context.exec(this.query).then(function(e){var n=t.context.compose(t.tableName,e,t.fkmap);return n})},t}(),l=function(){function t(){}return t.array=function(t){return Array.isArray(t)},t.number=function(t){return"number"==typeof t},t.string=function(t){return"string"==typeof t},t.object=function(t){return"object"==typeof t},t.undefined=function(t){return void 0===t},t}();e.is=l;var h=function(){function t(){}return t.removeWhiteSpace=function(t){return t.replace(/\s/g,"")},t}();e.StringUtils=h;var u=function(){function t(){}return t.serial=function(){function t(e,n,a){var r=e.pop();if(r){var i=r.splice(0,1)[0],o=r;i.apply(this,o).then(function(){t(e,n,a)})}else n()}for(var e=[],n=0;n<arguments.length;n++)e[n-0]=arguments[n];return 1===e.length&&(e=e[0]),e.reverse(),new Promise(function(n,a){t(e,n,a)})},t}();e.PromiseUtils=u;var p=function(){function t(){}return t.json=function(t,e,n){if(n){var a=this.cache[t];if(a)return e?new Promise(function(t,e){t(JSON.parse(a))}):JSON.parse(a)}var r=new XMLHttpRequest;return r.onreadystatechange=function(){return 4==r.readyState&&e?200==r.status?(n&&(this.cache[t]=r.responseText),new Promise(function(t,e){t(JSON.parse(a))})):new Promise(function(t,e){e(r.status)}):void 0},r.open("GET",t,e),r.send(),e?void 0:200==r.status?(n&&(this.cache[t]=r.responseText),JSON.parse(r.responseText)):r.status},t.cache={},t}();e.Load=p});