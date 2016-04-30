var express = require('express');
var bodyParser = require('body-parser');
var _ = require('underscore');
var db = require('./db.js');
var bcrypt = require('bcryptjs');
var  middleware = require('./middleware.js')(db);
var app = express();
var PORT = process.env.PORT || 3000;

var todos = [];
var todoNextId = 1;


//// SETUP MiddleWare ////
app.use(bodyParser.json());
//// SETUP MiddleWare ////



app.get('/', function(req, res) {
	res.send('todo API Root');
});


// GET /todos&completed=true&q=work
app.get('/todos', middleware.requireAuthentication, function(req, res) {
	var query = req.query;
	var where = {
		userId: req.user.get('id')
	}; 

	if (query.hasOwnProperty('completed') && query.completed === 'true') {
		where.completed = true;
	} else if (query.hasOwnProperty('completed') && query.completed === 'false') {
		where.completed = false;
	}

	if (query.hasOwnProperty('q') && query.q.length > 0) {
		where.description = {
			$like: '%' + query.q + '%'
		};
	}

	db.todo.findAll({
		where: where
	}).then(function(todos) {
		if (todos) {
			res.json(todos);
		} else {
			return res.status(404).send();
		}
	}, function(e) {
		res.status(500).send();
	});
});


// GET /todos/:id
app.get('/todos/:id', middleware.requireAuthentication, function(req, res) {
	var todoId = parseInt(req.params.id, 10);
	var where = {
		userId: req.user.get('id'),
		id: todoId
	};
	// sequelize
	db.todo.findOne({
		where: where
	}).then(function(todo) {
		if (!!todo) {
			res.json(todo.toJSON());
		} else {
			res.status(404).send();
		}
	}, function(e) {
		return res.status(500).send();
	});
});


// POST /todos
app.post('/todos', middleware.requireAuthentication, function(req, res) {
	var body = _.pick(req.body, 'description', 'completed');

	if (!_.isBoolean(body.completed) || !_.isString(body.description) || body.description.trim().length === 0) {
		return res.status(400).send();
	}

	db.todo.create({
		description: body.description.trim(),
		completed: body.completed
	}).then(function(todo) {
		req.user.addTodo(todo).then(function () {
			return todo.reload();
		}).then(function (todo) {
			res.json(todo.toJSON());
		});
	}, function(e) {
		return res.status(400).json(e);
	});
});


app.post('/users', function(req, res) {
	var body = _.pick(req.body, 'email', 'password');
	if(!_.isString(body.email) || !_.isString(body.password)) {
		return res.status(400).send();
	}

	db.user.create(body).then(function(user) {
		return res.status(200).json(user.toPublicJSON());
	}, function(e) {	
		return res.status(400).json(e);
	});
});

// POST /users/login
app.post('/users/login', function(req, res) {
	var body = _.pick(req.body, 'email', 'password');
	var userInstance;

	db.user.authenticate(body).then(function(user){
		var token = user.generateToken('authentication');
		userInstance = user; // save in instance variable to promise can access it
		return db.token.create({
			token: token
		});
	}).then(function (tokenInstance) {
		res.header('Auth', tokenInstance.get('token')).json(userInstance.toPublicJSON());
	}).catch(function(e) {
		res.status(401).send();
	});

});


// DELETE login really means DELETE then token == 'logout'
// DELETE /users/login
app.delete('/users/login', middleware.requireAuthentication, function(req, res) {
	req.token.destroy().then(function() {
		res.status(204).send();
	}).catch(function () {
		res.status(500).send();
	});
});


// DELETE '/todos/:id'
app.delete('/todos/:id', middleware.requireAuthentication, function(req, res) {
	var todoId = parseInt(req.params.id, 10);
	
	db.todo.destroy({
		where: {
			id: todoId,
			userId: req.user.get('id')
		}
	}, function(rowsDeleted) {
		if(rowsDeleted === 0) {
			res.status(404).json({
				error: 'No todo with id'
			});	
		} else {
			res.status(204).send();  // all OK, but no data to send
		}
	}, function(e) {
		return res.status(500).send();
	});


});


// PUT /todos/:id
app.put('/todos/:id', middleware.requireAuthentication, function(req, res) {
	var todoId = parseInt(req.params.id, 10);
	var body = _.pick(req.body, 'description', 'completed');
	var attributes = {};

	var where = {
		userId: req.user.get('id'),
		id: todoId
	};

	if (body.hasOwnProperty('completed')) {
		attributes.completed = body.completed;
	}

	if (body.hasOwnProperty('description')) {
		attributes.description = body.description;
	}

	db.todo.findOne({where: where}).then(function(todo) {
		if (todo) {
			todo.update(attributes).then(function(todo) {
				res.json(todo.toJSON());
			}, function(e) {
				res.status(400).json(e);
			});

		} else {
			res.status(404).send();
		}
	}, function(e) {
		res.status(500).send();
	});

});







// Call Sync, then Promise calls app.listen
db.sequelize.sync({force:true}).then(function() {
	app.listen(PORT, function() {
		console.log('Express listening on port ' + PORT + '!');
	});
});