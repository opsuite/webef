# WebEF
Entity Framework for the web. Built on google lovefield.
```    
	name:    web-ef
	version: 1.0
	author:  Christopher Amos
	date:    9/21/15
```

####DBContext.transaction()

    transaction( fn: (tx: lf.Transaction, context: T_CTX)=>Promise<any>) : Promise<any>

Opens a transaction on the Database Context. This transaction will immediately place exclusive locks on all the tables referenced by the Context. Your function should return a promise. If the promise is resolved the transaction will be commited. If the promise is rejected the transaction will be rolled back.

From the lovefield docs:
> All reserved locks will be promoted to Exclusive locks automatically by the query runner. The exclusive locks promoted from locks created by exec() method will be automatically released once Lovefield has completed necessary data writing. Locks created by transaction's begin() method will not be promoted nor released until rollback() or commit() are called on that transaction. This implies the possibility of deadlock when multiple closures are attempting to write the database via transactions. The users are responsible for preventing and detecting these user code generated deadlocks.

####DBContext.purge()

	purge() : Promise<any>
	
Warning: This function is for testing purposes only. This function will clear all rows from the database and reset all master indeces to 0.

####DBContext.select()

	select(...columns: lf.schema.Column[]) : lf.query.Select

Allows a query to select any data from any tables. same as Lovefield db.select 


####DBEntity.put()

    put(entity: T): Promise<number>;
	put(entities: T[]): Promise<number[]>;

The entity put method allows you to cascade update or insert (or both/mixed) records in the entity. This the operation is decided based on if the key holds a value. Any parts of the entity that have a key will be updated and any parts without a key will be inserted. This means that put can perform mixed operations if needed. The put method returns the key/keys in the same order as the input.

####DBEntity.get()

	get(id: number): Promise<T>;
	get(id?: number[]): Promise<T[]>;
	
The opposite of put. The entity get method will accept a key/keys and return entities from the database. The entities will be fully composed objects which are safe to edit.	
 
####DBEntity.delete()

	delete(id: number): Promise<T>;
	delete(id?: number[]): Promise<T[]>;
	
The entity delete method accepts a key/keys to perform a cascade delete in the database. If an 'isdeleted' column was specified in the table schema, the row will not be actually deleted but instead will be flagged otherwise if there is not an 'isdeleted' column specified the row will actually be deleted from the database. In either case the results from entity.get() and entity.query() will be the same. Flagged columns are not reported to the entity composer. Defining 'isdeleted' columns is optional but it considered good practice because it allows undo operations to be possible.

####DBEntity.query()

	query( fn: (context:T_CTX, query:DBQuery<T>)=>any): Promise<T[]>;

The entity query method is similar to get however it allows you to specify predicates instead of keys. This can be very useful for finding entities. Note: Since the entity composition process adds overhead to each row returned for large result sets you should use context.select instead which returns rows directly from lovefield. 

#####DBQuery<T>

	groupBy(...columns: lf.schema.Column[]): DBQuery<T>
	limit(numberOfRows: lf.Binder|number): DBQuery<T>
	orderBy(column: lf.schema.Column, order?: lf.Order): DBQuery<T>
	skip(numberOfRows: lf.Binder|number): DBQuery<T>
	where(predicate: lf.Predicate): DBQuery<T>
	explain():string
	toSql():string
	exec() : Promise<T[]>
