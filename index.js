const http = require("http");
const express = require("express");
const app = express();
const path = require('path');
const {Server} = require('socket.io');
const server = http.createServer(app);
const io = new Server(server);

const messages = [];

io.on('connection' , (socket) => {
	console.log('A new user has connected' , socket.id);

	socket.emit("load-history" , messages);

	socket.on("user-message", (message) => {
		const messageData = {
			text: message,
			sender: socket.id,
		};

		messages.push(messageData);

		io.emit("message" , messageData);
	})
});


app.use(express.static(path.resolve("./public")))


app.get('/' , (req,res) => {
	return res.sendFile(".public/index.html");
});


server.listen(7000, () => console.log('Server started at port 7000'));