import {DBContext,DBEntity} from './main';

class MyDBContext extends DBContext {
	
	public entity: DBEntity<Item> = 
		this.DBEntity({
			'item': {
				'id': 'pkey',
				'description': 'string',
				'deadline': 'date',
				'done': 'boolean'
			}
		});

}   

interface Item {
	id?: number;
	description: string;
	deadline: Date;
	done: boolean;
	
}	

(function(){
	
	var db = new MyDBContext('testDB');
	var item : Item = {
		description: 'Get a cup of coffee',
		deadline: new Date(),
		done: false
	};
	var inserts = 50000;
	
	var starttime = Date.now();
	db.transaction(()=>{
		for (var i=0; i< inserts; i++)
			db.entity.put(item);	
	}).then(()=>{
		var duration = Date.now() - starttime;
		console.log(`fastdb:websql ${inserts} inserts ${duration}ms`);	
	});
	
})();
