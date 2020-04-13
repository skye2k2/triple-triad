// This file starts the both the Express server, used to serve the actual webpage,
// and the Socket.io server, used to handle the the realtime connection to the client.

var express = require("express");
var app = express();
var http = require("http").Server(app);
var io = require("./libs/game_manager").listen(http);  // Start Socket.io server and let game_manager handle those connections

app.set("port", (process.env.PORT || 5000));  // Use either given port or 5000 as default

app.use(express.static("public"));  // Serve pages static-ly, using directory 'public' as root

// User connects to server
app.get("/", (req, res) => {
	// Will serve static pages, no need to handle requests
});

// If any page not handled already handled (ie. doesn't exists)
app.get("*", (req, res) => {
	res.status(404).send("Error 404 - Page not found");
});

// Start http server
http.listen(app.get("port"), () => {
	console.log("Node app started on port %s", app.get("port"));
});
