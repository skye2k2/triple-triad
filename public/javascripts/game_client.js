// This file manages the games client's logic. It's here that Socket.io connections are handled and functions from canvas.js are used to manage the game's visual appearance.

let ANIMATION_TIME = 600;
let animationTimeout;
let socket = io();
let canPlayCard = false;
let debugMode = true;
let inLobby = true;
let log;
let playerColor = "";
let playerRoundStrength = 5;
let playerRoundScore = 0;
let playerRunningScore;
let opponentColor = "";
let opponentRoundStrength = 5;
let opponentRoundScore = 0;
let opponentRunningScore;
let spectator = false;
let gameEventQueue = [];
let matchWinner, matchEndReason, readyToEnd, timerInterval;

//////////  Socket Events  \\\\\\\\\\
socket.on("lobby created", function (gameId) {
	console.log(`${document.location.href}gameId`);
	// TODO: Put up a placard overtop of everything else, with the link to have friends join
});

socket.on("enter match", function (matchDetail) {
	// TODO: Add matchId to match detail, so that players can copy a link for friends to spectate
	inLobby = false;
	document.body.removeAttribute('in-lobby');
	enterMatch(matchDetail);
});

// TODO: If playing a tiebreaker round, animate the cards back, instead of immediately clearing the board--maybe use a different event
socket.on("draw hand", function (cards) {
	// If we are in replay mode, keep from starting a new round until the current round is complete
	if (gameEventQueue.length === 0) {
		// TODO: Add a way of acknowledging the previous round before starting the next one
		setTimeout(() => {
			startRound(cards);
		}, ANIMATION_TIME);
	} else {
		gameEventQueue.push({type: 'draw', cards: cards});
	}
});

// moveDetail format: {cardIndexInHand: 0, location: '1,1', color: 'red', cardImageId: '104'}
socket.on("card played", function (moveDetail) {
	moveDetail.type = 'move';
	gameEventQueue.push(moveDetail);
	gameEvent();
});

// flipDetail format: {location: '1,1'}
socket.on("card flipped", function (flipDetail) {
	flipDetail.type = 'flip';
	gameEventQueue.push(flipDetail);
	gameEvent();
});

socket.on("update score", function (matchDetail) {
	gameEventQueue.push({type: 'stoplight', matchDetail: matchDetail});
	gameEvent();
});

// NOTE: This fires 4x immediately when watching bot games, due to the match completing in under a second
socket.on("update stats", function (stats) {
	if (inLobby) {
		// console.log(`update stats: ${stats}`);
		updateGameList('.lobby-list', stats.lobbies);
		updateGameList('.game-list', stats.matches);

		// TODO: Update server stats (player/game counts, etc.), as well
	}
});

socket.on("enable hand", function (activePlayer) {
	if (!spectator) {
		gameEventQueue.push({type: 'enable', active: activePlayer});
		gameEvent();
	}
});

socket.on("fight result", function (result) {
	displayResult(result);
});

socket.on("replay match", function (matchDetail) {
	// TODO: Implement. Loop through match log, and queue up events
});

socket.on("end match", function (matchDetail) {
	gameEventQueue.push({type: 'end', matchDetail: matchDetail});
});

socket.on("no match found", function () {
	console.log(`${window.location.pathname} match not found...redirecting...`);
	window.location.replace("/");
});

socket.on("no rematch", function () {
	if (labels["waiting"].visible) {
		labels["waiting"].visible = false;
	}
});

// Initialize the game client

// Catch the canvas play-card and rematch events, and send them on to Socket.io
document.addEventListener('event:create-lobby', createMatch);
document.addEventListener('event:play-card', playCard);
document.addEventListener('event:rematch', rematch);

socket.emit("request game list");

//////////  Functions  \\\\\\\\\\
function enterQueue () {
	if (debugMode) console.log("%s(%s)", arguments.callee.name, Array.prototype.slice.call(arguments).sort());
	socket.emit("enter queue");
	labels["play"].visible = false;
	labels["play"].clickable = false;
	labels["searching"].visible = true;
}

function enterMatch (matchDetail) {
	// debugMode && console.log(`enterMatch`, matchDetail);
	spectator = matchDetail.spectator;

	playerColor = matchDetail.playerColor;
	opponentColor = matchDetail.opponentColor;
	gameEventQueue = [];

	// If the spectated game is already in-progress, parse out the events from the log and replay them
	if (matchDetail.log && matchDetail.log.length) {
		generateReplayFromLog(matchDetail);
	}

	updateScores(matchDetail);

	// labels["result"].visible = false;
	// labels["main menu"].visible = false;
	// labels["main menu"].clickable = false;
	// labels["waiting"].visible = false;
	// resetDots(labels["waiting"]);
	// labels["searching"].visible = false;
	// resetDots(labels["searching"]);
	// displayCardSlots = true;
}

function createMatch (evt) {
	debugMode && console.log("event:create-lobby", evt.detail);
	socket.emit("create lobby", evt.detail);
}

function rematch (evt) {
	debugMode && console.log("event:rematch", evt.detail);

	if (evt.detail === 'yes') {
		// TODO: Add Analytics conversion event
		socket.emit("request rematch");
	} else {
		socket.emit("leave match");
		// TODO: Set state/show button to return to lobby
	}
}

function playCard (evt) {
	if (!spectator) {
		debugMode && console.log("event:play-card", evt.detail);

		socket.emit("play card", evt.detail.cardIndex, evt.detail.location);
	}
}

// TODO: FIGURE: A single game event queue works, for now, assuming that events do not come out of order.
// TODO: BUG: For extended matches, animation time appears to eventually drop to 0, because there are extra gameEvent() calls left over.
function gameEvent () {
	if (isRenderComplete()) {
		if (gameEventQueue.length) {
			if (animationTimeout) {
				window.clearTimeout(animationTimeout);
			}
			animationTimeout = setTimeout(() => {
				eventDetail = gameEventQueue.shift();
				switch (eventDetail.type) {
					case 'move':
						debugMode && console.log(`play card:${eventDetail.location}, ${eventDetail.cardImageId} ${(eventDetail.mine) ? '(mine)' : ''}`);
						moveCard(eventDetail);
						break;
					case 'flip':
						// If there are multiple flips cached from the last play, grab them all to play simultaneously
						debugMode && console.log(`flip card: ${eventDetail.location}`);
						flipCard(eventDetail.location);
						updatePlayerStrengthValues(eventDetail.matchDetail);
						while (nextEventType('flip')) {
							nextEventDetail = gameEventQueue.shift();
							debugMode && console.log(`flip card: ${nextEventDetail.location}`);
							flipCard(nextEventDetail.location);
							updatePlayerStrengthValues(nextEventDetail.matchDetail);
						}
						break;
					case 'draw':
						debugMode && console.log(`io: draw hand --> canvas.startRound()`);
						// TODO: Add a way of acknowledging the previous round before starting the next one
						startRound(eventDetail.cards);
						break;
					case 'stoplight':
						debugMode && console.log(`stoplight: ${JSON.stringify(eventDetail.matchDetail.scoreboard)}`);
						updateScores(eventDetail.matchDetail);
						break;
					case 'enable':
						// debugMode && console.log(`enable hand: ${eventDetail.active}`);
						updateActivePlayer(eventDetail.active);
						break;
					case 'end':
						debugMode && console.log(`endMatch`);
						endMatch(eventDetail.matchDetail);
						break;
					default:
						console.warn(`Unknown event type: ${eventDetail.type}`);
						break;
				}
				gameEvent();
			}, ANIMATION_TIME);
		}
	} else {
		if (gameEventQueue.length) {
			animationTimeout = setTimeout(() => {
				gameEvent();
			}, ANIMATION_TIME);
		} else {
			window.clearTimeout(animationTimeout);
		}
	}
}

function generateReplayFromLog (matchDetail) {
	log = matchDetail.log;

	playerRoundStrength = 5;
	opponentRoundStrength = 5;

	for (let i = 0; i < log.length; i++) {
		const logBits = log[i].split(':');
		// Log Format: {player color}:{event type}:{location}:{card index?}:{card id?}
		// If the log entry begins with `red` or `blue`, it is an event that we need to queue up
		if (logBits[0].includes('blue') || logBits[0].includes('red')) {
			switch (logBits[1]) {
				case 'play':
					gameEventQueue.push({type: 'move', location: logBits[2], cardIndexInHand: logBits[3],  color: logBits[0], cardImageId: logBits[4], spectator: (logBits[0].includes(playerColor)) ? true : false});
					break;
				case 'capture':
					// TODO: Either add the update score to the log, or always calculate it
					if (logBits[0].includes('blue')) { // When spectating, assume the player is blue
						playerRoundStrength++;
						opponentRoundStrength--;
					} else {
						playerRoundStrength--;
						opponentRoundStrength++;
					}
					gameEventQueue.push({type: 'flip', location: logBits[2], matchDetail: { roundStrength: {red: opponentRoundStrength, blue: playerRoundStrength}}});
					break;
				default:
					console.warn(`Unknown log entry format: ${log[i]}`);
					break;
			}
		} else if (logBits[0].includes('Begin Round')) {
			gameEventQueue.push({type: 'draw', cards: true});
		}
	}

	// Get things rolling, because gameEvent() cannot trigger until both hands have been rendered
	startRound(true);
	// IF THE FIRST ONE IS THE DRAW EVENT, WE CAN SKIP IT
	gameEvent();
}

function nextEventType (eventType) {
	let nextEvent = gameEventQueue[0];
	if (nextEvent && nextEvent.type === eventType) {
		return true;
	} else {
		return false;
	}
}

function updateActivePlayer (activePlayer) {
	if (isRenderComplete()) {
		enableCards(activePlayer);
	} else {
		setTimeout(() => {
			updateActivePlayer(activePlayer);
		}, ANIMATION_TIME * 2);
	}
}

function updateGameList(selector, list) {
	let listEl = document.querySelector(selector);
	listEl.innerHTML = '';

	for (let i = 0; i < list.length; i++) {
		let match = list[i];
		let row = document.createElement("li");
		let score =  (selector === '.game-list') ? `(${match.runningScore.blue} - ${match.runningScore.red})` : '';
		row.innerHTML = `<a href='/${match.id}' title='Join this match${(selector === '.game-list') ? " as a spectator" : ""}'>${match.id} ${score}</a>`;
		listEl.appendChild(row);
	}
}

// Any time a card is flipped, the round score values have changed, so update the numbers
function updatePlayerStrengthValues (matchDetail) {
	debugMode && console.log(`--> ${JSON.stringify(matchDetail.roundStrength)}`);
	renderPlayerScore(matchDetail.roundStrength[playerColor]);
	renderPlayerScore(matchDetail.roundStrength[opponentColor], true);
}

function updateScores (matchDetail) {
	// debugMode && console.log(`updateScores: ${JSON.stringify(matchDetail)}`);
	playerRoundScore = matchDetail.scoreboard[playerColor] || 0;
	opponentRoundScore = matchDetail.scoreboard[opponentColor] || 0;
	if (matchDetail.runningScore && (!!matchDetail.runningScore[playerColor] || !!matchDetail.runningScore[opponentColor])) {
		playerRunningScore = matchDetail.runningScore[playerColor] || 0;
		opponentRunningScore = matchDetail.runningScore[opponentColor] || 0;
	}
	renderScoreStoplight();
}

function endMatch (matchDetail) {
	updateScores(matchDetail);

	log = matchDetail.log;
	console.log(log);

	let winnerColor = (matchDetail.scoreboard.red > matchDetail.scoreboard.blue) ? 'red' : 'blue';
	let loserColor = (matchDetail.scoreboard.red > matchDetail.scoreboard.blue) ? 'blue' : 'red';

	// Wait for any processing animations to complete
	setTimeout(() => {
		enableCards(true);
		// TODO: Use game status notifications, instead of alerts
		if (!spectator) {
			if (playerColor === winnerColor) {
				playSound(fanfare);
				// alert(`You win! (${matchDetail.scoreboard[winnerColor]} - ${matchDetail.scoreboard[loserColor]})`);
			} else if (playerColor === loserColor) {
				playSound(loser);
				// alert(`You lose. (${matchDetail.scoreboard[loserColor]} - ${matchDetail.scoreboard[winnerColor]})`);
			}
			renderRematchBlock();
		} else {
			alert(`${winnerColor} wins! (${matchDetail.scoreboard[winnerColor]} - ${matchDetail.scoreboard[loserColor]})`);
		}
	}, ANIMATION_TIME * 2);

	// canPlayCard = false;
	// readyToEnd = false;
	// displayCardSlots = false;
	// for (var i = 0; i < handSlots.length; i++) {
	// 	handSlots[i].card = undefined;
	// }

	// if (matchEndReason === "player left") {
	// 	var reason = ["Your opponent", "You"][+(socket.id !== matchWinner)] + " left the match";
	// 	labels["rematch"].disabled = true;
	// 	labels["rematch"].clickable = false;
	// } else {
	// 	var reason = ["Your opponent has", "You have"][+(socket.id === matchWinner)] + " a full set";
	// 	labels["rematch"].clickable = true;
	// }

	// labels["result"].text = ["You Lose!", "You Win!"][+(socket.id === matchWinner)];
	// labels["result"].visible = true;
	// labels["rematch"].visible = true;
	// labels["main menu"].visible = true;
	// labels["main menu"].clickable = true;
	// matchWinner = undefined;
	// matchEndReason = undefined;
}

// TODO: DELETE THESE, ONCE GAME STATE IS STABLE
function exitMatch () {
	if (debugMode) console.log("%s(%s)", arguments.callee.name, Array.prototype.slice.call(arguments).sort());
	playerRoundStrength = 0;
	opponentRoundStrength = 5;
	socket.emit("leave match");
	labels["result"].visible = false;
	labels["main menu"].visible = false;
	labels["main menu"].clickable = false;
	labels["waiting"].visible = false;
	resetDots(labels["waiting"]);
	labels["play"].visible = true;
	labels["play"].clickable = true;
}

function animateLabels () {
	var dotLabels = [labels["waiting"], labels["searching"]];
	for (var i = 0; i < dotLabels.length; i++) {
		if (dotLabels[i].visible) {
			updateDots(dotLabels[i]);
		}
	}
}

function updateDots (label) {
	var dots = label.text.split(".").length - 1;
	var newDots = ((dots + 1) % 4);
	label.text = label.text.slice(0, -3) + Array(newDots + 1).join(".") + Array(3 - newDots + 1).join(" ");
}

function resetDots (label) {
	label.text = label.text.slice(0, -3) + "...";
}
