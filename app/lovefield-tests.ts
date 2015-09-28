/// <reference path="../typings/tsd.d.ts" />

///// <reference path="../typings/lovefield/lovefield.d.ts" />
import 'lovefield/dist/lovefield';


(function(){ 
    
    // execute functions returning promises sequentially
    function sequence(...items: any[][]) {
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
    
        
    
    var connectOptions: lf.schema.ConnectOptions;
    var todoDb: lf.Database = null;
    var dummyItem: lf.schema.Table = null;
    var inserts:number = 50000;
    
    createSchema('WebSQL').connect({storeType: lf.schema.DataStoreType.WEB_SQL}).then(websql =>{
        return sequence(
            [dropTable, websql, 'noReport'],
            [testInsertBatch, websql, 'WebSQL'],
            [dropTable, websql, 'WebSQL'],
            [testInsert, websql, 'WebSQL'],                        
            [testSelect, websql, 'WebSQL'],
            [testSelectPredicate, websql, 'WebSQL']
        );      
    })
    .then(()=>{
        createSchema('IndexedDB').connect({storeType: lf.schema.DataStoreType.INDEXED_DB}).then(indexeddb =>{
            return sequence(
                [dropTable, indexeddb, 'noReport'],
                [testInsertBatch, indexeddb, 'IndexedDB'],
                [dropTable, indexeddb, 'IndexedDB'],
                [testInsert, indexeddb, 'IndexedDB'],
                [testSelect, indexeddb, 'IndexedDB'],
                [testSelectPredicate, indexeddb, 'IndexedDB']
            );  
        })        
    })
        
    
    function createSchema(suffix:string) {
        var schemaBuilder: lf.schema.Builder = lf.schema.create(`todo_${suffix}`, 1);
        
        schemaBuilder.createTable('Item')
        .addColumn('id', lf.Type.INTEGER)
        .addColumn('description', lf.Type.STRING)
        .addColumn('deadline', lf.Type.DATE_TIME)
        .addColumn('done', lf.Type.BOOLEAN)    
        /*.addPrimaryKey(['id'],true)  AHHH dont use autoinc key option!!! no wonder they removed this from the typedef. performance is soooo bad! */
        .addIndex('idxId', ['id'], true, lf.Order.DESC)
        .addIndex('idxDone', ['done'], false, lf.Order.DESC);

        return schemaBuilder;
    }    
       
    function dropTable(db: lf.Database, storeType:string){ 

            var starttime:number = Date.now();                   
            dummyItem = db.getSchema().table('Item');
            return db.delete().from(dummyItem).exec().then(()=>{
                var duration = Date.now() - starttime;
                if (storeType !== 'noReport')
                    console.log(`lovefield:${storeType} deleting ${inserts} rows ${duration}ms`);
            })   
    }
    
    function testInsert(db: lf.Database, storeType: string) {        

        var starttime:number = Date.now();                      
        var dummyItem = db.getSchema().table('Item');
        
        var tx = db.createTransaction();
        var q = [];
        
        for (var i=0; i<inserts; i++) {
            var row = dummyItem.createRow({
                'id': i,
                'description': 'Get a cup of coffee',
                'deadline': new Date(),
                'done': false
            });           
            q.push(db.insert().into(dummyItem).values([row]));
        }
        return tx.exec(q).then(()=>{
            var duration = Date.now() - starttime;
            console.log(`lovefield:${storeType} ${inserts} inserts ${duration}ms`);                
        });

    }
    
    function testInsertBatch(db: lf.Database, storeType: string) {        

        var starttime:number = Date.now();            
        dummyItem = db.getSchema().table('Item');
                
        var rows = [];                
        for (var i=0; i<inserts; i++) {
            var row = dummyItem.createRow({
                'id': i,
                'description': 'Get a cup of coffee',
                'deadline': new Date(),
                'done': false
            });
            rows.push(row);
        }
        return db.insert().into(dummyItem).values(rows).exec().then(()=>{
            var duration = Date.now() - starttime;
            console.log(`lovefield:${storeType} 1 insert ${inserts} rows ${duration}ms`);               
        });
    }    
    
    /*
    function testSelectPredicate(db: lf.Database, storeType: string) {     
        
        var starttime:number = Date.now();        
        dummyItem = db.getSchema().table('Item');
        
        var tx = db.createTransaction();
        var q = [];
        
        for (var i=0; i<inserts; i++) {            
            var column: lf.schema.Column = (<any>dummyItem).id;
            var select = db.select().from(dummyItem).where(column.eq(10000));            
            q.push(select);
        }
        return tx.exec(q).then((r)=>{
                var duration = Date.now() - starttime;
                console.log(`lovefield:${storeType} ${inserts} selects single row ${duration}ms`);         
                if (r.length !== inserts) console.error('selected more rows than expected. Mabey a bug in db.delete()?');                
        });
    } 
    */
    
    function testSelectPredicate(db: lf.Database, storeType: string) {     
        
        var starttime:number = Date.now();            
        var dummyItem = db.getSchema().table('Item');                                          
        var id: lf.schema.Column = (<any>dummyItem).id;
        var done: lf.schema.Column = (<any>dummyItem).done;
        var select = db.select().from(dummyItem).where(lf.op.and(id.gt(-1), done.eq(false)));            
                    
        return select.exec().then((rows)=>{
            if (!rows.length || rows.length < inserts) console.error( `lovefield:${storeType} did not select the expected number of rows!`);
            else {
                var duration = Date.now() - starttime;
                console.log(`lovefield:${storeType} 1 select ${inserts} rows with predicate ${duration}ms`);
            }              
        });
    }  

    function testSelect(db: lf.Database, storeType: string) {     
        var starttime:number = Date.now();            
        var dummyItem = db.getSchema().table('Item');                                          
        var select = db.select().from(dummyItem);            
                    
        return select.exec().then((rows)=>{
            if (!rows.length || rows.length < inserts) console.error( `lovefield:${storeType} did not select the expected number of rows!`);
            else {
                var duration = Date.now() - starttime;
                console.log(`lovefield:${storeType} 1 select ${inserts} rows ${duration}ms`);
            }              
        });
    }  
   
    
})();