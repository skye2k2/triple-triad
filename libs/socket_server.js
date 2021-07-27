// This file handles all socket.io connections and lobby management

let socketIO = require("socket.io");

let AI = require("./ai");

let debugMode = true;

let players = [];
let lobbies = [];
let matches = [];
// let totalMatchesPlayed = 0;
let totalCardsPlayed = 0;

const matchChecker = RegExp(/[ACDEFGHJKLMNPRTWXY3679]{4}/);

//////////  Socket.io  \\\\\\\\\\
module.exports.listen = function (app) {
	io = socketIO.listen(app);

	io.on("connection", function (socket) {
		// console.log(`Player connected`);
		players.push({
			socket: socket
		});

		// Handle players/spectators requesting a specific match
		let requestPieces = socket.handshake.headers.referer.split('/')
		let potentialMatchId = requestPieces[requestPieces.length - 1]
		let matchIdCheck = matchChecker.test(potentialMatchId);
		if (matchIdCheck) {
			let match = findMatchById(potentialMatchId);
			if (!match) {
				lobby = findMatchById(potentialMatchId, true);
				// The match does not exist in any form--send event to redirect
				if (!lobby) {
					socket.emit("no match found");
				} else {
					console.log(`Player joined lobby ${potentialMatchId}`);
					createMatch([lobby.lobbyLeader, findPlayerBySocketId(socket.id)], lobby);
				}
			} else {
				console.log(`Spectator joined match ${potentialMatchId}`);
				match.spectators.push({socket: socket});
				// Setting spectator: true is critical for spectators to work
				socket.emit("enter match", Object.assign({}, { spectator: true, roundStrength: match.roundStrength, scoreboard: match.scoreboard, runningScore: match.runningScore, playerColor: 'blue', opponentColor: 'red', difficulty: match.difficulty, log: match.log, matchId: potentialMatchId }));
				socket.join(potentialMatchId);
			}
		} else if (potentialMatchId === "DEMO") {
			// DEMO: A short-circuited bot vs. bot match
			console.log(`DEMO match requested`);
			let gameConfig = {
				difficulty: "HARD",
				matchId: "DEMO",
				private: false,
				rules: "BASIC",
				solo: true
			}
			createLobby(findPlayerBySocketId(socket.id), gameConfig);

			match = findMatchById(potentialMatchId);
			match.spectators.push({socket: socket});
			// Setting spectator: true is critical for spectators to work
			socket.emit("enter match", Object.assign({}, { spectator: true, roundStrength: match.roundStrength, scoreboard: match.scoreboard, runningScore: match.runningScore, playerColor: 'blue', opponentColor: 'red', difficulty: match.difficulty, log: match.log, matchId: potentialMatchId }));
			socket.join(potentialMatchId);
		}

		// TODO: Determine what triggers on a page refresh and add spectator cleanup to the list of things to do

		socket.on("reconnect", function () {
			console.log("TODO: IMPLEMENT RECONNECT SO THAT A PAGE REFRESH DOES NOT MEAN A FORFEIT");
			console.log("See if we still have the match data, and can rebuild the board and player's hand from the game log.");
		});

		// Only happens on page refresh
		socket.on("disconnect", function () {
			// console.log("Your opponent disconnected. Waiting 10 seconds to see if they reconnect, before they automatically forfeit the match.");
			playerDisconnected(socket);
		});

		socket.on("end", function () {
			// IF MATCH IS DEMO MATCH
			playerDisconnected(socket);
		});

		socket.on("create lobby", function (detail) {
			startLobby(socket, detail);
		});

		socket.on("cancel lobby", function () {
			leaveMatch(socket);
		});

		socket.on("play card", function (index, location) {
			totalCardsPlayed++;
			AI.gameplay.playCard(findMatchBySocketId(socket.id), socket, index, location);
		});

		socket.on("leave match", function () {
			leaveMatch(socket);
		});

		socket.on("request game list", function () {
			io.updateMatchStatistics(socket);
		});

		socket.on("request rematch", function () {
			rematchRequested(socket);
		});
	});

	// TODO: Build in throttling, so that the actual game is not bogged down by extra notifications. If a specific socket is provided, just update for that player.
	io.updateMatchStatistics = function (playerSocket, sendToAll) {
		let stats = {
			lobbies: [],
			matches: [],
			totalCardsPlayed: totalCardsPlayed,
			// totalMatchesPlayed: totalMatchesPlayed,
			totalPlayers: players.length, // includes players and spectators
			totalBotsInGame: 0
		}

		for (let i = 0; i < lobbies.length; i++) {
			let match = lobbies[i];

			if (!match.private) {
				stats.lobbies.push({id: match.matchId});
			}
		}

		for (let i = 0; i < matches.length; i++) {
			let match = matches[i];

			if (match.started) {
				stats.matches.push({id: match.matchId, spectatorCount: match.spectators.length, matchCount: match.matchCount, runningScore: match.runningScore});
			}
		}

		if (sendToAll || !playerSocket) {
			io.sockets.emit("update stats", stats);
		} else if (playerSocket) {
			playerSocket.emit("update stats", stats);
		}
	}

	return io;
};

function log (logString) {
	if (debugMode) {
		console.log(logString);
	}
}

// Lobby/Match Management

function createId (idLength = 4) {
	var id = "";
	var charset = "ACDEFGHJKLMNPRTWXY3679"; // Only use easy-to-read options
	for (var i = 0; i < idLength; i++) {
		id += charset.charAt(Math.floor(Math.random() * charset.length));
	}

	// Check against the unlikely event that the generated id already exists, and create an alternate ID
	if (idLength === 2) {
		for (var i = 0; i < players.length; i++) {
			if (players[i].bot === true && players[i].socket === id) {
				return createId(idLength);
			}
		}
		return id;
	}

	for (var i = 0; i < lobbies.length; i++) {
		if (lobbies[i].matchId === id) {
			return createId(idLength);
		}
	}
	for (var i = 0; i < matches.length; i++) {
		if (matches[i].matchId === id) {
			return createId(idLength);
		}
	}
	return id;
}

function createBot (lobby) {
	let botId = `${lobby.difficulty}BOT-${createId(2)}`;
	log(`${botId} created for match: ${lobby.matchId}`);

	return {
		bot: true,
		difficulty: lobby.difficulty,
		socket: {
			AI: AI, // In order to play cards, we need a reference to the AI object
			emit: function () {},
			join: function () {},
			id: botId
		}
	};
}

function createLobby (lobbyLeader, gameConfig) {
	let id = createId();
	let lobby = {
		difficulty: gameConfig.difficulty,
		lobbyLeader: lobbyLeader,
		matchId: gameConfig.matchId || id,
		private: gameConfig.private,
		rules: gameConfig.rules,
		solo: gameConfig.solo
	};

	log(`CREATE ${gameConfig.private ? 'PRIVATE ' : ''}LOBBY: ${lobby.matchId}`);

	if (gameConfig.solo) {
		let bot = createBot(lobby);
		players.push(bot);

		if (gameConfig.matchId === "DEMO") {
			let secondBot = createBot(lobby);
			players.push(secondBot);
			createMatch([findPlayerBySocketId(bot.socket.id), findPlayerBySocketId(secondBot.socket.id)], lobby);
		} else {
			createMatch([lobbyLeader, findPlayerBySocketId(bot.socket.id)], lobby);
		}
	} else {
		lobbies.push(lobby);
		lobbyLeader.socket.emit("lobby created", lobby.matchId);
		io.updateMatchStatistics();
	}
}

function createMatch (participants, lobby) {
	let startingPlayerIndex = (Math.floor(Math.random() * 2) === 0)? 0 : 1;
	let match = {
		matchCount: 0,
		matchId: lobby.matchId,
		tiebreakerRounds: 0,
		players: [],
		rules: lobby.rules,
		runningScore: {
			red: 0,
			blue: 0
		},
		solo: lobby.solo,
		difficulty: lobby.difficulty,
		spectators: []
	};

	AI.gameplay.setMatchDefaults(match);

	for (var i = 0; i < participants.length; i++) {
		var playerObject = {
			activePlayer: (i === startingPlayerIndex),
			bot: participants[i].bot || false,
			color: (i === startingPlayerIndex)? 'red' : 'blue',
			socket: participants[i].socket,
			deck: AI.gameplay.generateDeck(), // BUG: We should be able to do this in startNewRound(), but the events on the client clear the board unnecessarily
			cards: []
		};
		match.players.push(playerObject);
		// TODO: CLEANUP: Just have a single state object that contains all of the round and match information to send to the clients, or a function that assembles the data on-the-fly, to keep duplication down
		participants[i].socket.emit("enter match", Object.assign({}, { matchId: match.matchId, roundStrength: match.roundStrength, scoreboard: match.scoreboard, runningScore: match.runningScore, playerColor: playerObject.color, opponentColor: (playerObject.color === 'red') ? 'blue' : 'red', solo: match.solo, difficulty: match.difficulty }));

		participants[i].socket.join(match.matchId);
	}

	match.ioTo = io.to;

	// io.to(id).emit("enter match"); // This was the old way of starting the match
	matches.push(match);

	var index = lobbies.indexOf(lobby);
	if (index > -1) {
		lobbies.splice(index, 1);
	}

	console.log(`CREATE MATCH: ${match.matchId}`);

	match.started = true;
	AI.gameplay.startNewRound(match);
}

function findMatchById (matchId, checkLobby) {
	let arrayToCheck = (checkLobby) ? lobbies: matches;
	for (var i = 0; i < arrayToCheck.length; i++) {
		if (arrayToCheck[i].matchId === matchId) {
			return arrayToCheck[i];
		}
	}
	return false;
}

function findMatchBySocketId (socketId) {
	for (var i = 0; i < matches.length; i++) {
		for (var j = 0; j < matches[i].players.length; j++) {
			if (matches[i].players[j].socket.id === socketId) {
				return matches[i];
			}
		}

		for (var j = 0; j < matches[i].spectators.length; j++) {
			if (matches[i].spectators[j].socket.id === socketId) {
				return matches[i];
			}
		}
	}
	for (var i = 0; i < lobbies.length; i++) {
		if (lobbies[i].lobbyLeader.socket.id === socketId) {
			return lobbies[i];
		}
	}
	return false;
}

function findPlayerBySocketId (socketId) {
	for (var i = 0; i < players.length; i++) {
		if (players[i].socket.id === socketId) {
			return players[i];
		}
	}
	return false;
}

function leaveMatch (socket) {
	var match = findMatchBySocketId(socket.id);
	if (match) {
		// if (!match.isOver) {
		// 	var winner = match.players[match.players[0].socket.id !== socket.id ? 0 : 1];
		// 	// endMatch(match, winner, "player left");
		// } else {
		// 	io.to(match.matchId).emit("no rematch");
		// }
		if (match.matchId === "DEMO") {
		// 	// Do not remove match if there are additional spectators
		// 	console.log(`SPECTATORS REMAINING: ${match.spectators.length}`);
		// 	if (match.spectators.length === 0) { // THIS IS NOT CURRENTLY WORKING
				console.log(`DEMO match replay ended`);
				removeMatch(match);
			// }
		} else {
			removeMatch(match);
		}
	}
}

function playerDisconnected (socket) {
	var match = findMatchBySocketId(socket.id);
	if (match) {
		var player = findPlayerBySocketId(socket.id);
		var index = players.indexOf(player);
		if (index > -1) {
			leaveMatch(socket);
			players.splice(index, 1);
		}

		var index = match.spectators.indexOf(player);
		if (index > -1) {
			leaveMatch(socket);
			match.spectators.splice(index, 1);
		}
	}
	// TODO: Remove any lobbies or matches the player is part of
}

function rematchRequested (socket) {
	var match = findMatchBySocketId(socket.id);
	if (match) {
		if ((match.rematch && match.rematch !== socket.id) || match.solo || match.matchId === "DEMO") {
			AI.gameplay.setMatchDefaults(match, true);
			io.to(match.matchId).emit("update score", {scoreboard: match.scoreboard, runningScore: match.runningScore});
			AI.gameplay.startNewRound(match);
		} else {
			match.rematch = socket.id;
		}
	}
}

function removeMatch (match) {
	var index = matches.indexOf(match);
	if (index > -1) {
		// console.log(`REMOVING MATCH: ${match.matchId}`);
		matches.splice(index, 1);
	}
	var index = lobbies.indexOf(match);
	if (index > -1) {
		// console.log(`REMOVING LOBBY: ${match.matchId}`);
		lobbies.splice(index, 1);
	}
	io.updateMatchStatistics();
}

// TODO: Handle different configuration options from `gameConfig`
function startLobby (socket, gameConfig) {
	var player = findPlayerBySocketId(socket.id);
	createLobby(player, gameConfig);
	// TODO: Set up additional bits, and move pieces from createMatch(), as necessary
}

// We will need to do this via an npm script bound to a client-like implementation
// https://stackoverflow.com/a/29424685/5334305
