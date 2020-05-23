// This file handles all socket.io connections and manages the server-side game logic.

let socketIO = require("socket.io");

let AI = require("./ai");

let debugMode = true;

let players = [];
let lobbies = [];
let matches = [];
let totalMatchesPlayed = 0;

let timerDuration = 22;

// | Board |_0_|_1_|_2_|
// |   0   |   |   |   |
// |   1   |   |   |   |
// |   2   |   |   |   |

let emptySpace = {color: null, card: null};

let emptyBoard = [
	[emptySpace, emptySpace, emptySpace],
	[emptySpace, emptySpace, emptySpace],
	[emptySpace, emptySpace, emptySpace],
];

// DISABLE COUNTDOWN TIMERS, FOR NOW
// updateGameTimers();

const matchChecker = RegExp(/[ACDEFGHJKLMNPRTUWXY3679]{4}/);

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
				socket.emit("enter match", Object.assign({}, { spectator: true, roundStrength: match.roundStrength, scoreboard: match.scoreboard, runningScore: match.runningScore, playerColor: 'blue', opponentColor: 'red', log: match.log }));
				socket.join(potentialMatchId);
			}
		}

		// TODO: Determine what triggers on a page refresh and add spectator cleanup to the list of things to do

		socket.on("reconnect", function () {
			console.log("TODO: IMPLEMENT RECONNECT SO THAT A PAGE REFRESH DOES NOT MEAN A FORFEIT");
			console.log("See if we still have the match data, and can rebuild the board and player's hand from the game log.");
		});

		socket.on("disconnect", function () {
			// console.log("Your opponent disconnected. Waiting 10 seconds to see if they reconnect, before they automatically forfeit the match.");
			playerDisconnected(socket);
		});

		socket.on("create lobby", function (detail) {
			startLobby(socket, detail);
		});

		socket.on("cancel lobby", function () {
			leaveMatch(socket);
		});

		socket.on("play card", function (index, location) {
			playCard(socket, index, location);
		});

		socket.on("leave match", function () {
			leaveMatch(socket);
		});

		socket.on("request game list", function () {
			updateMatchStatistics(socket);
		});

		socket.on("request rematch", function () {
			rematchRequested(socket);
		});
	});
	return io;
};

// function updateGameTimers() {
// 	for (var i = 0; i < matches.length; i++) {
// 		if (matches[i].timerActive) {
// 			matches[i].timer -= 1;
// 			if (matches[i].timer === 0) {
// 				timesup(matches[i]);
// 			}
// 		}
// 	}
// 	setTimeout(updateGameTimers, 1000);
// }

// function timesup(match) {
// 	match.timerActive = false;
// 	match.timer = timerDuration;
// 	if (match.players[0].cur) {
// 		if (match.players[1].cur) {
// 			calculateResult(match);
// 		} else {
// 			processRound(match, false, match.players[0]);
// 		}
// 	} else {
// 		if (match.players[1].cur) {
// 			processRound(match, false, match.players[1]);
// 		} else {
// 			processRound(match, true, match.players[0]);
// 		}
// 	}
// }

function log (logString, match) {
	if (match) {
		match.log.push(logString);
	}
	if (debugMode) {
		console.log(logString);
	}
}

// Lobby/Queue Management

// TODO: Handle different configuration options from `gameConfig`
function startLobby (socket, gameConfig) {
	var player = findPlayerBySocketId(socket.id);
	createLobby(player, gameConfig);
	// TODO: Set up additional bits, and move pieces from createMatch(), as necessary
}

// Match Management

function createId (idLength = 4) {
	var id = "";
	var charset = "ACDEFGHJKLMNPRTUWXY3679"; // Only use easy-to-read options
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

function createLobby (lobbyLeader, gameConfig) {
	let id = createId();
	let lobby = {
		lobbyLeader: lobbyLeader,
		matchId: id,
		private: gameConfig.private,
		rules: gameConfig.rules,
		solo: gameConfig.solo
	};

	if (gameConfig.solo) {
		let botId = `BOT-${createId(2)}`;
		players.push({
			bot: true,
			socket: {
				emit: function () {},
				join: function () {},
				id: botId
			}
		});
		console.log(`Bot ${botId} created for match: ${id}`);
		createMatch([lobbyLeader, findPlayerBySocketId(botId)], lobby);
	} else {
		lobbies.push(lobby);
		lobbyLeader.socket.emit("lobby created", id);

		updateMatchStatistics();
	}
}

function createMatch (participants, lobby) {
	let startingPlayerIndex = (Math.floor(Math.random() * 2) === 0)? 0 : 1;
	let match = {
		matchCount: 0,
		matchId: lobby.matchId,
		players: [],
		rules: lobby.rules,
		runningScore: {
			red: 0,
			blue: 0
		},
		solo: lobby.solo,
		spectators: [],
		timerActive: false,
		timer: timerDuration
	};

	setMatchDefaults(match);

	for (var i = 0; i < participants.length; i++) {
		var playerObject = {
			activePlayer: (i === startingPlayerIndex),
			bot: participants[i].bot || false,
			color: (i === startingPlayerIndex)? 'red' : 'blue',
			socket: participants[i].socket,
			deck: generateDeck(), // BUG: We should be able to do this in startNewRound(), but the events on the client clear the board unnecessarily
			cards: []
		};
		match.players.push(playerObject);
		// TODO: CLEANUP: Just have a single state object that contains all of the round and match information to send to the clients, or a function that assembles the data on-the-fly, to keep duplication down
		participants[i].socket.emit("enter match", Object.assign({}, { roundStrength: match.roundStrength, scoreboard: match.scoreboard, runningScore: match.runningScore, playerColor: playerObject.color, opponentColor: (playerObject.color === 'red') ? 'blue' : 'red' }));

		participants[i].socket.join(match.matchId);
	}

	// io.to(id).emit("enter match"); // This was the old way of starting the match
	matches.push(match);

	var index = lobbies.indexOf(lobby);
	if (index > -1) {
		lobbies.splice(index, 1);
	}

	// HARD-CODED REMATCH TESTING
	// match.matchCount = 3;
	// match.runningScore = {
	// 	red: 2,
	// 	blue: 1
	// };
	// rematchRequested(match.players[0].socket);
	// rematchRequested(match.players[1].socket);

	// HARD-CODED MATCH EVENT TESTING
	// setTimeout(() => {
	// 	match.scoreboard.red = 2;
	// 	match.scoreboard.blue = 1;
	// 	match.runningScore.red = 10;
	// 	match.runningScore.blue = 17;
	// 	endMatch(match);
	// }, 2000);

	console.log(`CREATE MATCH: ${match.matchId}`);

	match.started = true;
	startNewRound(match);
	match.timerActive = true;
}

function endMatch (match) {
	totalMatchesPlayed++;
	console.log('END MATCH');
	io.to(match.matchId).emit("end match", {scoreboard: match.scoreboard, log: match.log, runningScore: match.runningScore});
	match.isOver = true;

	updateMatchStatistics();
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
		removeMatch(match);
	}
}

function playerDisconnected (socket) {
	var player = findPlayerBySocketId(socket.id);
	var index = players.indexOf(player);
	if (index > -1) {
		leaveMatch(socket);
		players.splice(index, 1);
	}
	// TODO: Remove any lobbies or matches the player is part of
}

// Reset the bits that need to be for each match
function setMatchDefaults (match, rematch) {
	match.matchCount++;

	if (rematch) {
		delete match.rematch;
	}

	const defaults = {
		isOver: false,
		log: [],
		roundNumber: 0,
		roundStrength: {
			red: 5,
			blue: 5
		},
		scoreboard: {
			red: 0,
			blue: 0
		},
	}

Object.assign(match, defaults)
}

function rematchRequested (socket) {
	var match = findMatchBySocketId(socket.id);
	if (match) {
		if ((match.rematch && match.rematch !== socket.id) || match.solo) {
			setMatchDefaults(match, true);
			io.to(match.matchId).emit("update score", {scoreboard: match.scoreboard, runningScore: match.runningScore});
			startNewRound(match);
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
	updateMatchStatistics();
}

// TODO: Build in throttling, so that the actual game is not bogged down by extra notifications
function updateMatchStatistics (playerSocket) {
	let stats = {
		lobbies: [],
		matches: [],
		totalMatchesPlayed: totalMatchesPlayed,
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

	if (playerSocket) {
		playerSocket.emit("update stats", stats);
	} else {
		for (let z = 0; z < players.length; z++) {
			players[z].socket.emit("update stats", stats);
		}
	}
}

// Round Scoring & Management

/**
 * @description - After a card is played, determine its effect on the board, and if the board is now full, determine the round winner.
 * @returns {undefined} - Modifies match data directly.
 */
function calculateResult (match, coords, replay) {
	attack(match, coords, 'north', replay);
	attack(match, coords, 'east', replay);
	attack(match, coords, 'south', replay);
	attack(match, coords, 'west', replay);

	let gameSpaces = 0;
	let filledSpaces = 0;
	match.board.map((row) => {row.map((space) => {gameSpaces++; if (space.color) { filledSpaces++; }});});

	if (filledSpaces === gameSpaces) {
		processRound(match);
	}
}

/**
 * @description - From the attacking space, determine if any cards need to be flipped.
 * @returns {undefined} - Modifies match data directly.
 */
function attack (match, coords, attackingDirection, replay) {
	let board = match.board;
	let attackingLocation = board[coords[0]][coords[1]];
	let defendingLocation;
	let defendingLocationString; // Add back in 1 to deal with offset

	// Determine if there is a card in the direction attacked
	switch (attackingDirection) {
		case 'north':
			defendingLocation = (coords[0] - 1 in board) ? board[coords[0] - 1][coords[1]] : false || false;
			defendingLocationString = `${coords[0]},${coords[1] + 1}`;
			defendingDirection = 'south';
			break;
		case 'east':
			defendingLocation = board[coords[0]][coords[1] + 1] || false;
			defendingLocationString = `${coords[0] + 1},${coords[1] + 2}`;
			defendingDirection = 'west';
			break;
		case 'south':
			defendingLocation = (coords[0] + 1 in board) ? board[coords[0] + 1][coords[1]] : false || false;
			defendingLocationString = `${coords[0] + 2},${coords[1] + 1}`;
			defendingDirection = 'north';
			break;
		case 'west':
			defendingLocation = board[coords[0]][coords[1] - 1] || false;
			defendingLocationString = `${coords[0] + 1},${coords[1]}`;
			defendingDirection = 'east';
			break;
		default:
			break;
	}

	// Determine if defending card belongs to opponent
	if (defendingLocation && defendingLocation.color !== attackingLocation.color) {
		// Only the card played can flip, if its power is greater than the defending card.
		if (match.rules === "BASIC") {
			if (defendingLocation.card && attackingLocation.card[attackingDirection] > defendingLocation.card[defendingDirection]) {
				match.roundStrength[attackingLocation.color]++;
				match.roundStrength[defendingLocation.color]--;
				defendingLocation.color = attackingLocation.color;
				log(`${attackingLocation.color}:capture:${defendingLocationString}:${defendingLocation.card.name} (${attackingDirection})`, match);
				io.to(match.matchId).emit("card flipped", {location: defendingLocationString, matchDetail: { roundStrength: match.roundStrength}});
			}
		// TODO: equal values can flip on the initial placement, and then flipped cards can "combo", flipping additional cards if they are more powerful.
		} else if (match.rules === "SAME") {
		}
	}
}

/**
 * @description - After all board slots have been filled, determine round winner, ending match is someone won 2 out of 3.
 * @returns {undefined} - Modifies match data directly.
 */
function processRound (match) {
	let redRoundScore = match.roundStrength.red;
	let blueRoundScore = match.roundStrength.blue;

	if (redRoundScore === blueRoundScore) {
		// Immediately play another round, with each player taking the cards they currently own on the board
		tiebreaker(match);
		return;
	} else if (redRoundScore > blueRoundScore) {
		log(`End Round ${match.roundNumber}`, match);
		log(`red win round: (${redRoundScore} - ${blueRoundScore})`, match);
		match.scoreboard.red++;
	} else if (blueRoundScore > redRoundScore) {
		log(`End Round ${match.roundNumber}`, match);
		log(`blue win round: (${blueRoundScore} - ${redRoundScore})`, match);
		match.scoreboard.blue++;
	}

	let redTotalScore = match.scoreboard.red;
	let blueTotalScore = match.scoreboard.blue;

	io.to(match.matchId).emit("update score", {scoreboard: match.scoreboard, runningScore: match.runningScore});

	// var matchResults = {
	// 	tied: tied,
	// 	winner: {
	// 		socketId: winner.socket.id,
	// 		points: winner.points
	// 	},
	// 	loser: {
	// 		socketId: loser.socket.id,
	// 		points: loser.points
	// 	}
	// };
	// io.to(match.matchId).emit("round result", matchResults);

	// Check if game is over, otherwise start the next round
	if (redTotalScore === 2) {
		match.runningScore.red++
		log(`red: WIN MATCH (${redTotalScore} - ${blueTotalScore})`);
		endMatch(match);
	} else if (blueTotalScore === 2) {
		match.runningScore.blue++
		log(`blue: WIN MATCH (${blueTotalScore} - ${redTotalScore})`);
		endMatch(match);
	} else {
		log(`Total Score: red: ${redTotalScore} blue: ${blueTotalScore}`);
		startNewRound(match);
	}
}

/**
 * @description - Reset round-based flags and values, swap starting players, and deal a new hand to each player.
 * @returns {undefined} - Modifies match data directly, and EMITS hand to player.
 */
function startNewRound (match, tiebreakerRound) {
	updateMatchStatistics();
	if (tiebreakerRound) {
		log(`Begin Round ${match.roundNumber} Tiebreaker ${match.matchId}`, match);
	} else {
		match.roundNumber++;
		log(`Begin Round ${match.roundNumber} ${match.matchId}`, match);
	}
	match.board = JSON.parse(JSON.stringify(emptyBoard));
	match.roundStrength = {red: 5, blue: 5}

	for (var i = 0; i < match.players.length; i++) {
		let player = match.players[i];

		// If players are out of cards, generate a high-power hand for the final round
		if (!player.deck.length) {
			let powerDeckDistribution = {
				tier6: 1,
				tier7: 1,
				tier8: 1,
				tier9: 1,
				tier10: 1,
			};

			if (match.roundNumber !== 1) {
				player.deck = generateDeck(powerDeckDistribution);
			} else {
				player.deck = generateDeck();
			}
		}
		dealHand(player);
		player.socket.emit("draw hand", player.cards);
	}

	for (var i = 0; i < match.spectators.length; i++) {
		let spectator = match.spectators[i];
		spectator.socket.emit("draw hand", true);
	}

	toggleActivePlayer(match);

	// HARD-CODED TESTING
	// setTimeout(() => {
	// 	let activePlayer = (match.players[0].activePlayer) ? 0 : 1;
	// 	let otherPlayer = (activePlayer === 0) ? 1 : 0;
	// 	// HARD-CODED AI TESTING
	// 	if (match.roundNumber < 4) {
	// 		playAICard(AI.play(match, activePlayer));
	// 		playAICard(AI.play(match, otherPlayer));
	// 		playAICard(AI.play(match, activePlayer));
	// 		playAICard(AI.play(match, otherPlayer));
	// 		playAICard(AI.play(match, activePlayer));
	// 		playAICard(AI.play(match, otherPlayer));
	// 		playAICard(AI.play(match, activePlayer));
	// 		playAICard(AI.play(match, otherPlayer));
	// 		playAICard(AI.play(match, activePlayer));
	// 	}
	// }, 1000);
}

/**
 * @description - If a round is going to end in a draw, have each player pick up the cards they currently own to form a new hand, and play until a winner is decided.
 * @returns {undefined} - Modifies match data directly, and calls out to start another round.
 */
function tiebreaker (match) {
	for (var i = 0; i < match.players.length; i++) {
		let player = match.players[i];
		let playerColor = player.color;

		// Also give the unplayed card back to its owner
		for (var j = 0; j < player.cards.length; j++) {
			if (player.cards[j]) {
				player.deck.unshift(player.cards[j]);
			}
		}

		// Loop through board and give each player the cards they currently own
		match.board.map((row) => {row.map((space) => { if (space.color === playerColor) {
			match.players[i].deck.unshift(space.card);
		}});});
	}
	startNewRound(match, true);
}

/**
 * @description - After a card is played, or at the start of a match/round(?), enable/disable player hands, so that only one card can be played at a time, alternating players.
 * @returns {undefined} - Modifies match data directly, and calls out to players with update.
 */
function toggleActivePlayer (match) {
	for (var i = 0; i < match.players.length; i++) {
		let player = match.players[i];
		player.activePlayer = !player.activePlayer;
		player.socket.emit("enable hand", player.activePlayer);

		if (player.bot && player.activePlayer) {
			playAICard(AI.play(match, player));
		}
	}
}

// Card Management

/**
 * @description - Create a shuffled deck for a player from all available cards, based on the provided distribution, or one from each tier, if no distribution is provided.
 * @returns {Array} - An array of available cards to the player.
 */
function generateDeck (distribution) {
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
			var randomCardIndex = Math.floor(Math.random() * (AI.cardList[tier].length));
			// console.log(tier, randomCardIndex, (cards[tier][randomCardIndex]) ? cards[tier][randomCardIndex].name : 'ERROR');
			// TODO: Generate random card IDs to discourage cheating
			// TODO: Try to avoid duplicates between players
			deck.push(AI.cardList[tier][randomCardIndex]);
		}
	}

	shuffleDeck(deck);
	return deck;
}

/**
 * @description - Deal a player a hand from the cards in their deck.
 * @returns {undefined} - Modifies match data directly.
 */
function dealHand (playerObject) {
	playerObject.cards = [];
	for (var i = 0; i < 5; i++) {
		playerObject.cards[i] = drawCard(playerObject.deck);
	}
	// TODO: RE-SORT HAND BY TIER TO HELP PLAYERS OUT. BUT THEN OPPONENT CARDS JUST NEED TO BE PLAYED FROM THE TOP DOWN, OTHERWISE THE OPPONENT WILL KNOW THE RELATIVE STRENGTH OF THEIR OPPONENT'S REMAINING HAND
}

/**
 * @description - Pull the top card from the given deck.
 * @returns {Object} - The card drawn from the player's deck.
 */
function drawCard (deck) {
	return deck.shift();
}

function playAICard(playDetail) {
	// console.log(`AI PLAY: ${playDetail.cardIndex} ${playDetail.location}`);
	playCard(playDetail.socket, playDetail.cardIndex, playDetail.location, true);
}

/**
 * @description - Play the card at the specified hand index to the specified location.
 * @returns {undefined} - Modifies match data directly and calls out, if needed.
 */
function playCard (socket, cardIndex, location, replay) {
	// console.log('playCard attempt: ', socket.id, `\n cardIndex: ${cardIndex}\n location: ${location}`);
	let match = findMatchBySocketId(socket.id);
	if (match) {
		let player = match.players[match.players[0].socket.id === socket.id ? 0 : 1];
		let coords = location.split(',');
		// Shift to handle 0-indexed array on server vs 1-indexed locations on client
		coords[0]--;
		coords[1]--;
		let boardLocation = match.board[coords[0]][coords[1]];
		if (!boardLocation.card && player.activePlayer) {
			if (cardIndex >= 0 && cardIndex <= 4) {
				if (player.cards[cardIndex] !== null) {
					let card = player.cards[cardIndex];
					// TODO: Should be able to do a mod of `player`
					let opponent = match.players[match.players[0].socket.id !== socket.id ? 0 : 1];

					boardLocation.card = card;
					boardLocation.color = player.color;

					log(`${player.color}:play:${location}:${cardIndex}:${card.id}:${card.name}`, match);

					opponent.socket.emit("card played", {cardIndexInHand: cardIndex, location: location, color: opponent.color, cardImageId: card.id});
					if (replay) {
						player.socket.emit("card played", {cardIndexInHand: cardIndex, location: location, color: player.color, cardImageId: card.id, mine: true});
					}
					for (var i = 0; i < match.spectators.length; i++) {
						let spectator = match.spectators[i];
						spectator.socket.emit("card played", {cardIndexInHand: cardIndex, location: location, color: player.color, cardImageId: card.id, spectator: (player.color === 'blue') ? true : false});
					}

					player.cards[cardIndex] = null;

					// Only toggle the active player if a player still has cards. The active player switches at the start of each round, in order to alternate fairly
					for (let i = 0; i < player.cards.length; i++) {
						if (player.cards[i]) {
							// We want calculateResult to happen before toggling the active player, but calculateResult *could* trigger a new round, which would give the players new cards, so, we're using a timeout, because using an intermediary value didn't work...however, this also makes things awkward when attempting to run a pure bot match...
							setTimeout(() => {
								toggleActivePlayer(match);
							}, 0);
							break;
						}
					}

					calculateResult(match, coords, replay);

				} else {
					console.log(`INVALID PLAY: (card already played: ${cardIndex})`);
					console.log(player.cards);
				}
			}
		} else {
			// The only way this should happen is if a player hacked their CSS to re-enable events on the other player's turn, or the AI tried to cheat
			console.warn(`INVALID MOVE ATTEMPTED (location: ${location} potentially occupied, activePlayer: ${player.activePlayer})`);
			player.socket.emit("undo play", {cardIndexInHand: cardIndex, location: location}); // TODO: IMPLEMENT THIS
		}
	}
}

/**
 * @description - Quickly re-order cards using an efficient pseudo-random method.
 * @returns {undefined} - Modifies deck parameter in-place.
 */
function shuffleDeck (deck) {
	// Durstenfeld Shuffle (modified Fisher-Yates, which modifies in-place): https://stackoverflow.com/a/12646864/5334305 https://bost.ocks.org/mike/shuffle/
	for (let i = deck.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[deck[i], deck[j]] = [deck[j], deck[i]];
	}
}

// Testing


// TODO: Have a clean way to set up a mock match, so that we can call all functions without worrying about if the variables are defined, or not
// We will need to do this via an npm script bound to a client-like implementation
// https://stackoverflow.com/a/29424685/5334305
