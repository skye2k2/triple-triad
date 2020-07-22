// This file manages the games client's logic. It's here that Socket.io connections are handled and functions from canvas.js are used to manage the game's visual appearance.

let socket = io();

let ANIMATION_TIME = 600;
let animationTimeout;
let canPlayCard = false;
let debugMode = false;
let gameEventQueue = [];
let log;
let matchId = '';
let playerColor = '';
let playerRoundScore = 0;
let playerRoundStrength = 5;
let playerRunningScore;
let opponentColor = '';
let opponentRoundScore = 0;
let opponentRoundStrength = 5;
let opponentRunningScore;
let spectator = false;
let state = 'lurking';
let matchWinner, matchEndReason, readyToEnd, timerInterval;

//////////  Socket Events  \\\\\\\\\\
socket.on("lobby created", function (matchId) {
	enterLobby(matchId);
});

socket.on("enter match", function (matchDetail) {
	enterMatch(matchDetail);
});

// TODO: If playing a tiebreaker round, animate the cards back, instead of immediately clearing the board--maybe use a different event
socket.on("draw hand", function (cards) {
	// If we are in replay mode, keep from starting a new round until the current round is complete
	if (gameEventQueue.length === 0) {
		// TODO: Add a way of acknowledging the previous round before starting the next one
		// The reason this different handling is needed is because of the isRenderComplete check that makes sure that cards are rendered before processing the event queue. TODO: Fix this.
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
	if (state === 'lurking') {
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
document.addEventListener('event:cancel-lobby', cancelMatch);
document.addEventListener('event:play-card', playCard);
document.addEventListener('event:rematch', rematch);

socket.emit("request game list");

//////////  Functions  \\\\\\\\\\
function setState (state) {
	state = state;
	// Remove all attributes, then add the current one
	[...document.body.attributes].forEach((attr) => {
		document.body.removeAttribute(attr.name)
	});
	document.body.setAttribute(state, true);
}

function enterLobby (matchId) {
	// console.log(`${document.location.href}${matchId}`);
	document.querySelector('.game-link').innerHTML = `${document.location.href}${matchId}`;
	setState('inlobby');
}

function enterMatch (matchDetail) {
	// debugMode && console.log(`enterMatch`, matchDetail);
	setState('ingame');

	matchId = matchDetail.matchId;
	difficulty = matchDetail.difficulty;
	solo = matchDetail.solo;
	spectator = matchDetail.spectator;

	playerColor = matchDetail.playerColor;
	opponentColor = matchDetail.opponentColor;
	opponentBotLevel = (difficulty) ? difficulty : undefined;
	gameEventQueue = [];

	// If the spectated game is already in-progress, parse out the events from the log and replay them
	if (matchDetail.log && matchDetail.log.length) {
		generateReplayFromLog(matchDetail);
	}

	updateScores(matchDetail);
}

function createMatch (evt) {
	debugMode && console.log("event:create-lobby", evt.detail);
	socket.emit("create lobby", evt.detail);
}

function cancelMatch (evt) {
	debugMode && console.log("event:cancel-lobby");
	socket.emit("cancel lobby", evt.detail);
	setState('lurking');
}

function rematch (evt) {
	debugMode && console.log("event:rematch", evt.detail);

	if (evt.detail === 'yes') {
		socket.emit("request rematch");
		trackEvent('Match', 'Request Rematch', `${playerRunningScore} - ${opponentRunningScore}`);
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
						debugMode && console.log(`play card: ${eventDetail.location}, ${eventDetail.cardImageId} ${(eventDetail.mine) ? '(mine)' : ''}`);
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
					// TODO: Either add the end round to the log, or always calculate it
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

function updateScores (matchDetail, isForMatch) {
	// debugMode && console.log(`updateScores: ${JSON.stringify(matchDetail)}`);
	playerRoundScore = matchDetail.scoreboard[playerColor] || 0;
	opponentRoundScore = matchDetail.scoreboard[opponentColor] || 0;
	if (matchDetail.runningScore && (!!matchDetail.runningScore[playerColor] || !!matchDetail.runningScore[opponentColor])) {
		playerRunningScore = matchDetail.runningScore[playerColor] || 0;
		opponentRunningScore = matchDetail.runningScore[opponentColor] || 0;
	}
	renderScoreStoplight();

	// TODO: BUG: This check keeps us from running on the initial deal, but also keeps us from running on tiebreakers. What we could do is have an additional event that is fired to animate everyone's cards back into their hands, which would also trigger this.
	if (matchDetail.scoreboard.red || matchDetail.scoreboard.blue || matchDetail.runningScore.red || matchDetail.runningScore.blue) {
		calculateWinnerAndLoserDetail(matchDetail, isForMatch);
	}
}

// Do the calculations required to determine winner/loser status, and fire appropriate events
function calculateWinnerAndLoserDetail (matchDetail, isForMatch) {
	let scoreLocation = (isForMatch) ? matchDetail.scoreboard : matchDetail.roundStrength;
	let eventCategory = (isForMatch) ? 'Match' : 'Round';

	if (solo) {
		eventCategory = `${eventCategory} (${difficulty})`
	}

	let winnerColor = (scoreLocation && scoreLocation.red > scoreLocation.blue) ? 'red' : 'blue';
	let loserColor = (scoreLocation && scoreLocation.red > scoreLocation.blue) ? 'blue' : 'red';
	let score = '';
	let result = '';

	if (!spectator) {
		if (scoreLocation) {
			if (scoreLocation.red === scoreLocation.blue) {
				result = 'Tie';
				score = `${scoreLocation.red} - ${scoreLocation.blue}`;
			} else
			if (playerColor === winnerColor) {
				result = 'Win';
				score = `${scoreLocation[winnerColor]} - ${scoreLocation[loserColor]}`;
				if (isForMatch) {
					playSound(fanfare);
				}
			} else {
				result = 'Lose';
				score = `${scoreLocation[loserColor]} - ${scoreLocation[winnerColor]}`;
				if (isForMatch) {
					playSound(loser);
				}
			}
		}

		if (isForMatch) {
			renderRematchBlock();
		}
	} else {
		result = 'Spectate'
		// TODO: Use game status notifications, instead of alerts
		if (isForMatch) {
			alert(`${winnerColor} wins! (${matchDetail.scoreboard[winnerColor]} - ${matchDetail.scoreboard[loserColor]})`);
		}
	}

	if (scoreLocation) {
		// Track that a round/match was completed, whether as a player or spectator
		trackEvent(eventCategory, result, score);
	}
}

function endMatch (matchDetail) {

	log = matchDetail.log;
	console.log(log);

	// Wait for any processing animations to complete
	setTimeout(() => {
		updateScores(matchDetail, true);

		enableCards(true);

	}, ANIMATION_TIME * 2);

	// if (matchEndReason === "player left") {
	// 	var reason = ["Your opponent", "You"][+(socket.id !== matchWinner)] + " left the match";
	// 	labels["rematch"].disabled = true;
	// 	labels["rematch"].clickable = false;
	// } else {
	// 	var reason = ["Your opponent has", "You have"][+(socket.id === matchWinner)] + " a full set";
	// 	labels["rematch"].clickable = true;
	// }
}

/*
	ANALYTICS EVENT MATRIX:

	category options: Match/Round [(EASY/HARD)]
	action: Tie/Win/Lose/Spectate
	label: {playerScore} - {playerScore}

*/
function trackEvent (category, action, label) {
	if (typeof ga !== 'undefined') {
		ga('send', {
			hitType: 'event',
			eventCategory: category,
			eventAction: action,
			eventLabel: label
		});
	} else {
		debugMode && console.log(`ANALYTICS EVENT:`, category, action, label);
	}
}
