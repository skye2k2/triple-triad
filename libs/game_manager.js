// This file handles all socket.io connections and manages the server-side game logic.

let socketio = require("socket.io");

let cards = require("./cards");

let players = [];
let queue = [];
let matches = [];
let rematchRequests = [];

let debugMode = false;
let timerDuration = 22;

// | Board |_0_|_1_|_2_|
// |   0   |   |   |   |
// |   1   |   |   |   |
// |   2   |   |   |   |

let emptyBoard = [
	[{color: null, card: null}, {color: null, card: null}, {color: null, card: null}],
	[{color: null, card: null}, {color: null, card: null}, {color: null, card: null}],
	[{color: null, card: null}, {color: null, card: null}, {color: null, card: null}],
];

// DISABLE COUNTDOWN TIMERS, FOR NOW
// updateGameTimers();

//////////  Socket.io  \\\\\\\\\\
module.exports.listen = function(app) {
	io = socketio.listen(app);
	io.on("connection", function(socket) {
		players.push({
			socket: socket,
			deck: undefined
		});

		socket.on("reconnect", function() {
			console.log("TODO: IMPLEMENT THIS SO THAT A PAGE REFRESH DOES NOT MEAN A FORFEIT");
		});

		socket.on("disconnect", function() {
			playerDisconnectedFromMatch(socket);
		});

		socket.on("enter queue", function() {
			enterQueue(socket);
		});

		socket.on("leave queue", function() {
			leaveQueue(socket);
		});

		socket.on("play card", function(index, location) {
			playCard(socket, index, location);
		});

		socket.on("leave match", function() {
			leaveMatch(socket);
		});

		socket.on("request rematch", function() {
			rematchRequested(socket);
		});
	});
	return io;
};

function updateGameTimers() {
	// log(arguments)
	for (var i = 0; i < matches.length; i++) {
		if (matches[i].timerActive) {
			matches[i].timer -= 1;
			if (matches[i].timer === 0) {
				timesup(matches[i]);
			}
		}
	}
	setTimeout(updateGameTimers, 1000);
}

function timesup(match) {
	log(arguments)
	match.timerActive = false;
	match.timer = timerDuration;
	if (match.players[0].cur) {
		if (match.players[1].cur) {
			calculateResult(match);
		} else {
			processRound(match, false, match.players[0]);
		}
	} else {
		if (match.players[1].cur) {
			processRound(match, false, match.players[1]);
		} else {
			processRound(match, true, match.players[0]);
		}
	}
}

function log(arguments) {
	if (debugMode) {
		console.log("%s(%j)", arguments.callee.name, Array.prototype.slice.call(arguments).sort());
	}
}

// Lobby/Queue Management

function enterQueue(socket) {
	log(arguments)
	var player = findPlayerById(socket.id);
	if (queue.indexOf(player) === -1) {
		queue.push(player);
		socket.emit("queue entered");
		if (queue.length >= 2) {
			createMatch([queue.shift(), queue.shift()]);
		}
	}
}

function leaveQueue(socket) {
	log(arguments)
	var player = findPlayerById(socket.id);
	var index = queue.indexOf(player);
	if (index > -1) {
		queue.splice(index, 1);
	}
	socket.emit("queue left");
}

// Match Management

function createId() {
	log(arguments)
	var id = "";
	var charset = "ABCDEFGHIJKLMNOPQRSTUCWXYZabcdefghijklmnopqrtsuvwxyz1234567890";
	for (var i = 0; i < 16; i++) {
		id += charset.charAt(Math.floor(Math.random() * charset.length));
	}
	return id;
}

function createMatch(participants) {
	log(arguments)

	let id = createId();
	let startingPlayer = (Math.floor(Math.random() * 2) == 0);
	let match = {
		board: emptyBoard,
		roundStrength: {
			red: 5,
			blue: 5
		},
		scoreboard: {
			red: 0,
			blue: 0
		},
		log: [],
		rules: "BASIC",
		matchId: id,
		players: [],
		isOver: false,
		timerActive: false,
		timer: timerDuration
	};
	for (var i = 0; i < participants.length; i++) {
		var playerObject = {
			activePlayer: (i === startingPlayer),
			color: (i === startingPlayer)? 'red' : 'blue',
			socket: participants[i].socket,
			deck: generateDeck(),
			cards: []
		};
		dealHand(playerObject);
		match.players.push(playerObject);
		participants[i].socket.emit("draw hand", playerObject.cards);
		participants[i].socket.join(id);
	}
	matches.push(match);
	io.to(id).emit("enter match");
	match.timerActive = true;
}

function endMatch(match, winner) {
	log(arguments)
	io.to(match.matchId).emit("end match", winner.socket.id);
	match.isOver = true;
}

function findMatchBySocketId(socketId) {
	log(arguments)
	for (var i = 0; i < matches.length; i++) {
		for (var j = 0; j < matches[i].players.length; j++) {
			if (matches[i].players[j].socket.id === socketId) {
				return matches[i];
			}
		}
	}
	return false;
}

function findPlayerById(socketId) {
	log(arguments)
	for (var i = 0; i < players.length; i++) {
		if (players[i].socket.id === socketId) {
			return players[i];
		}
	}
	return false;
}

function leaveMatch(socket) {
	log(arguments)
	var match = findMatchBySocketId(socket.id);
	if (match) {
		if (!match.isOver) {
			var winner = match.players[match.players[0].socket.id !== socket.id ? 0 : 1];
			endMatch(match, winner, "player left");
		} else {
			io.to(match.matchId).emit("no rematch");
		}
		removeMatch(match);
	}
}

function playerDisconnectedFromMatch(socket) {
	log(arguments)
	var player = findPlayerById(socket.id);
	var index = players.indexOf(player);
	if (index > -1) {
		leaveQueue(socket);
		leaveMatch(socket);
		players.splice(index, 1);
	}
}

function rematchRequested(socket) {
	log(arguments)
	var match = findMatchBySocketId(socket.id);
	if (match) {
		var players = match.players;
		if (match.rematch !== undefined && match.rematch !== socket.id) {
			removeMatch(match);
			createMatch(players);
		} else {
			match.rematch = socket.id;
		}
	}
}

function removeMatch(match) {
	log(arguments)
	var index = matches.indexOf(match);
	if (index > -1) {
		matches.splice(index, 1);
	}
}

// Round Scoring & Management

function calculateResult(match, coords) {
	log(arguments)
	// let boardTracker = [[true, true, true], [true, true, true], [true, true, true]];

	attack(match, coords, 'north');
	attack(match, coords, 'east');
	attack(match, coords, 'south');
	attack(match, coords, 'west');

	let gameSpaces = 0;
	let filledSpaces = 0;
	emptyBoard.map((row) => {row.map((space) => {gameSpaces++; if (space.color) { filledSpaces++; }});});

	if (filledSpaces === gameSpaces) {
		processRound(match);
	}
}

function attack(match, coords, attackingDirection) {
	let board = match.board;
	let attackingLocation = board[coords[0]][coords[1]];
	let defendingLocation;

	// Determine if there is a card in the direction attacked
	switch (attackingDirection) {
		case 'north':
			defendingLocation = board[coords[0] - 1][coords[1]] || false;
			defendingDirection = 'south';
			break;
		case 'east':
			defendingLocation = board[coords[0]][coords[1] + 1] || false;
			defendingDirection = 'west';
			break;
		case 'south':
			defendingLocation = board[coords[0] + 1][coords[1]] || false;
			defendingDirection = 'north';
			break;
		case 'west':
			defendingLocation = board[coords[0]][coords[1] - 1] || false;
			defendingDirection = 'east';
			break;
		default:
			break;
	}

	// Determine if defending card belongs to opponent
	if (defendingLocation && defendingLocation.color !== attackingLocation.color) {
		// Only the card played can flip, if its power is greater than the defending card(s).
		if (match.rules === "BASIC") {
			if (cardToCheck && card[attackingDirection] > defendingLocation.card[defendingDirection]) {
				match.roundStrength[attackingLocation.color]++;
				match.roundStrength[defendingLocation.color]--;
				defendingLocation.color = attackingLocation.color;
				match.log.append(` - Capture: ${attackingLocation.color}: ${location}: ${defendingLocation.card.name}`);
			}
		// TODO: equal values can flip on the initial placement, and then flipped cards can "combo", flipping additional cards if they are more powerful.
		} else if (match.rules === "SAME") {
		}
	}
}

function processRound(match) {
	log(arguments)
	let redRoundScore = match.roundStrength.red;
	let blueRoundScore = match.roundStrength.blue;
	let redTotalScore = match.scoreboard.red;
	let blueTotalScore = match.scoreboard.blue;

	if (redRoundScore === blueRoundScore) {
		// Immediately play another round, with each player taking the cards they currently own on the board
		tiebreaker(match);
	} else if (redRoundScore > blueRoundScore) {
		match.log.append(`red: Win Round (${redRoundScore} - ${blueRoundScore})`);
		redTotalScore++;
	} else if (blueRoundScore > redRoundScore) {
		match.log.append(`blue: Win Round (${blueRoundScore} - ${redRoundScore})`);
		blueTotalScore++;
	}

	var matchResults = {
		tied: tied,
		winner: {
			socketId: winner.socket.id,
			points: winner.points
		},
		loser: {
			socketId: loser.socket.id,
			points: loser.points
		}
	};
	io.to(match.matchId).emit("round result", matchResults);

	// Check if game is over, otherwise start the next round
	if (redTotalScore === 2) {
		match.log.append(`red: Win Game (${redTotalScore} - ${blueTotalScore})`);
		endMatch(match);
	} else if (blueTotalScore === 2) {
		match.log.append(`blue: Win Game (${blueTotalScore} - ${redTotalScore})`);
		endMatch(match);
	} else {
		startNewRound(match);
	}
}

function startNewRound(match) {
	log(arguments)
	match.board = emptyBoard;
	match.roundStrength = {red: 5, blue: 5}

	for (var i = 0; i < match.players.length; i++) {
		let player = match.players[i];
		player.activePlayer = !player.activePlayer;

		// If players are out of cards, generate a high-power hand for the final round
		if (!player.deck.length) {
			let powerDeckDistribution = {
				tier6: 1,
				tier7: 1,
				tier8: 1,
				tier9: 1,
				tier10: 1,
			};
			player.deck = generateDeck(powerDeckDistribution);
		}
		dealHand(player);
	}
	// SEND UPDATE OUT TO PLAYERS
}

function tiebreaker(match) {
	for (var i = 0; i < match.players.length; i++) {
		match.players[i].activePlayer = !match.players[i].activePlayer;
		let playerColor = match.players[i].color;

		// Loop through board, and give each player the cards they currently own
		// match.players[i].cards.push(foundCard);
	}
}

// Card Management

function generateDeck(distribution) {
	log(arguments)
	let deck = [];
	// Create a randomized, but balanced deck of 10 cards (enough for two rounds, with a heavy-hitter tiebreaker hand drawn, if needed).
	let balancedDeckDistribution = {
		tier1: 1,
		tier2: 1,
		tier3: 1,
		tier4: 1,
		tier5: 1,
		tier6: 1,
		tier7: 1,
		tier8: 1,
		tier9: 1,
		tier10: 1,
	};

	for (let [tier, count] of Object.entries(distribution || balancedDeckDistribution)) {
		for (var i = 0; i < count; i++) {
			var randomCardIndex = Math.floor(Math.random() * (cards[tier].length));
			console.log(tier, randomCardIndex, cards[tier][randomCardIndex].name);
			// TODO: Generate random card IDs to discourage cheating
			// TODO: Avoid duplicates
			deck.push(cards[tier][randomCardIndex]);
		}
	}

	shuffleDeck(deck);
	// console.log(deck);
	return deck;
}

function dealHand(playerObject) {
	log(arguments)
	playerObject.cards = [];
	for (var i = 0; i < 5; i++) {
		playerObject.cards[i] = drawCard(playerObject.deck);
	}
}

function drawCard(deck) {
	log(arguments)
	return deck.shift();
}

function playCard(socket, cardIndex, location) {
	log(arguments)
	let match = findMatchBySocketId(socket.id);
	if (match) {
		let player = match.players[match.players[0].socket.id === socket.id ? 0 : 1];
		let coords = location.split(',');
		let boardLocation = match.board[coords[0]][coords[1]].card;
		if (!boardLocation) {
			if (cardIndex >= 0 && cardIndex <= 4) {
				if (player.cards[cardIndex] !== undefined) {
					let card = player.cards[cardIndex];
					player.cards[cardIndex] = undefined;
					// TODO: Should be able to do a mod of `player`
					let opponent = match.players[match.players[0].socket.id !== socket.id ? 0 : 1];
					player.activePlayer = false;
					opponent.activePlayer = true;

					boardLocation.card = card;
					boardLocation.color = player.color;

					match.log.append(`${player.color}: ${location}: ${card.name}`);

					calculateResult(match, coords);
				}
			}
		} else {
			// Send back invalid move warning
		}
	}
}

function shuffleDeck(deck) {
	// log(arguments)
	// Durstenfeld Shuffle (modified Fisher-Yates, which modifies in-place): https://stackoverflow.com/a/12646864/5334305 https://bost.ocks.org/mike/shuffle/
	for (let i = deck.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[deck[i], deck[j]] = [deck[j], deck[i]];
	}
}

// Testing
generateDeck();

// TODO: Have a clean way to set up a mock match, so that we can call all functions without worrying about if the variables are defined, or not
// We will need to do this via an npm script bound to a client-like implementation
// https://stackoverflow.com/a/29424685/5334305
