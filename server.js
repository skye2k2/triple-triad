// This file starts the both the Express server, used to serve the actual webpage,
// and the Socket.io server, used to handle the the realtime connection to the client.

// TODO: Consider serving static gzipped files: https://www.npmjs.com/package/express-static-gzip

const express = require('express');
const app = express();
const compression = require('compression');
const zlib = require('zlib');
const path = require('path');

app.use(compression({
	filter: () => {return true},
	strategy: zlib.Z_RLE // TODO: FIGURE: gzip is being applied to pngs, but not actually saving any payload
}));

// TODO: FIGURE: /socket.io path is not gzipped, but it *is* cached

app.use(express.static(path.join(__dirname, 'public'), {
	etag: false,
	immutable: true,
	lastModified: false,
	maxAge: 86400000 * 30
})); // Serve pages static-ly, using directory 'public' as root

const http = require("http").Server(app);
const io = require('./libs/game_manager').listen(http);  // Start Socket.io server and let game_manager handle those connections

app.set('port', (process.env.PORT || 5000));  // Use either given port or 5000 as default

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
  console.log('Node + Express server listening on port ' + app.get('port'));
});
