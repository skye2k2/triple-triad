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

if (process.env.PORT) {
	// TODO: FIGURE: Multiple static routes, so that we can only cache HTML pages for a single day (because phones and force-refresh)
	app.use(express.static(path.join(__dirname, 'public'), {
		etag: false,
		immutable: true, // NOTE: This makes it so that no query is even sent to the server for matched requests, if there is a cached version.
		lastModified: false,
		maxAge: 86400000 * 1 // 86400000 milliseconds in one day
	})); // Serve pages static-ly, using directory 'public' as root
} else {
	app.use(express.static(path.join(__dirname, 'public'), {
		// DISABLE FORCED NO-REQUEST CACHING WHILE DEVELOPING LOCALLY
	})); // Serve pages static-ly, using directory 'public' as root
}


const http = require("http").Server(app);
const io = require('./libs/socket_server').listen(http);  // Start Socket.io server and let socket_server handle those connections

app.set('port', (process.env.PORT || 5000));  // Use either given port or 5000 as default

// User connects to server
app.get("/", (req, res) => {
	// Will serve static pages, no need to handle requests
});

// User/spectator requests a specific match (/DEMO is a special route)
app.get( '^/:matchId([ACDEFGHJKLMNOPRTUWXY3679]{4})', (req, res) => {
	console.log(`Connection request for match: ${req.params.matchId}`);
	// Forward lowercase requests to uppercase routes
	if (/[a-z]/.test(req.params.matchId)) {
		res.redirect(301, `/${req.params.matchId.toUpperCase()}`);
	} else {
		res.sendFile('index.html', {root: './public'});
	}
});

// 404 catch-all for routes not matched
app.get("*", (req, res) => {
	// Send bad requests back to the lobby
	res.redirect(301, `/`);
	// res.status(404).send(`Error 404 - Game not found: ${req.params.matchId}`);
});

// Start http server
http.listen(app.get("port"), () => {
  console.log('Node + Express server listening on port ' + app.get('port'));
});
