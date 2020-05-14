// This file manages the games client's logic. It's here that Socket.io connections are handled and functions from canvas.js are used to manage the game's visual appearance.

let ANIMATION_TIME = 800;
let socket = io();
let canPlayCard = false;
let debugMode = true;
let log;
let playerColor = "";
let playerRoundStrength = 5;
let playerRoundScore = 0;
let playerRunningScore;
let opponentColor = "";
let opponentRoundStrength = 5;
let opponentRoundScore = 0;
let opponentRunningScore;
let cardEventQueue = [];
let matchWinner, matchEndReason, readyToEnd, timerInterval;

//////////  Socket Events  \\\\\\\\\\
socket.on("enter match", function (matchDetail) {
	enterMatch(matchDetail);
});

socket.on("draw hand", function (cards) {
	// If we are in replay mode, keep from starting a new round until the current round is complete
	if (cardEventQueue.length === 0) {
		// TODO: Add a way of acknowledging the previous round before starting the next one
		setTimeout(() => {
			startRound(cards);
		}, ANIMATION_TIME);
	} else {
		cardEventQueue.push({type: 'draw', cards: cards});
	}
});

// moveDetail format: {cardIndexInHand: 0, location: '1,1', color: 'red', cardImageId: '104'}
socket.on("card played", function (moveDetail) {
	moveDetail.type = 'move';
	cardEventQueue.push(moveDetail);
	if (cardEventQueue.length === 1) {
		cardEvent();
	}
});

// flipDetail format: {location: '1,1'}
socket.on("card flipped", function (flipDetail) {
	flipDetail.type = 'flip';
	cardEventQueue.push(flipDetail);
	if (cardEventQueue.length === 1) {
		cardEvent();
	}
});

socket.on("update score", function (matchDetail) {
	cardEventQueue.push({type: 'stoplight', matchDetail: matchDetail});
});

socket.on("enable cards", function (activePlayer) {
	if (cardEventQueue.length === 0) {
		setTimeout(() => {
			updateActivePlayer(activePlayer);
		}, ANIMATION_TIME);
	} else {
		cardEventQueue.push({type: 'enable', active: activePlayer});
	}
});

socket.on("fight result", function (result) {
	displayResult(result);
});

socket.on("replay match", function (matchDetail) {
	// TODO: Implement. Loop through match log, and queue up events
});

socket.on("end match", function (matchDetail) {
	cardEventQueue.push({type: 'end', matchDetail: matchDetail});
	cardEvent(); // MAYBE?
});

socket.on("no rematch", function () {
	if (labels["waiting"].visible || labels["rematch"].visible) {
		labels["waiting"].visible = false;
		labels["rematch"].disabled = true;
		labels["rematch"].clickable = false;
		labels["rematch"].visible = true;
	}
});

// Catch the canvas play-card and rematch events, and send them on to Socket.io
document.addEventListener('event:play-card', playCard);
document.addEventListener('event:rematch', rematch);

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

	playerColor = matchDetail.playerColor;
	opponentColor = matchDetail.opponentColor;
	playerRoundStrength = matchDetail.roundStrength[playerColor];
	opponentRoundStrength = matchDetail.roundStrength[opponentColor];
	cardEventQueue = [];

	updateScores(matchDetail);

	// labels["result"].visible = false;
	// labels["main menu"].visible = false;
	// labels["main menu"].clickable = false;
	// labels["rematch"].visible = false;
	// labels["rematch"].clickable = false;
	// labels["rematch"].disabled = false;
	// labels["waiting"].visible = false;
	// resetDots(labels["waiting"]);
	// labels["searching"].visible = false;
	// resetDots(labels["searching"]);
	// displayCardSlots = true;
}

function rematch (evt) {
	debugMode && console.log("event:rematch", evt.detail);

	if (evt.detail === 'yes') {
		// TODO: Add Analytics conversion event
		socket.emit("request rematch");
	} else {
		socket.emit("leave match");
	}
}

function playCard (evt) {
	debugMode && console.log("event:play-card", evt.detail);

	socket.emit("play card", evt.detail.cardIndex, evt.detail.location);
}

// TODO: FIGURE: A single card event queue works, for now, assuming that events do not come out of order.
// TODO: BUG: For extended matches, animation time appears to eventually drop to 0, maybe because there are extra cardEvent() calls left over.
function cardEvent () {
	if (isRenderComplete() && cardEventQueue.length) {
		cardEventDetail = cardEventQueue.shift();
		switch (cardEventDetail.type) {
			case 'move':
				debugMode && console.log(`play card:${cardEventDetail.location}, ${cardEventDetail.cardImageId} ${(cardEventDetail.mine) ? '(mine)' : ''}`);
				moveCard(cardEventDetail);
				break;
			case 'flip':
				// TODO: If there are multiple flips cached, grab them all to play simultaneously
				debugMode && console.log(`flip card: ${cardEventDetail.location}`);
				flipCard(cardEventDetail.location);
				updatePlayerStrengthValues(cardEventDetail.matchDetail);
				break;
			case 'draw':
				debugMode && console.log(`io: draw hand --> canvas.startRound()`);
				// TODO: Add a way of acknowledging the previous round before starting the next one
				startRound(cardEventDetail.cards);
				break;
			case 'stoplight':
				debugMode && console.log(`canvas.renderScoreStoplight() ${JSON.stringify(cardEventDetail.matchDetail.scoreboard)}`);
				updateScores(cardEventDetail.matchDetail);
				break;
			case 'enable':
				debugMode && console.log(`enable hand: ${cardEventDetail.active}`);
				updateActivePlayer(cardEventDetail.active);
				break;
			case 'end':
				debugMode && console.log(`endMatch`);
				endMatch(cardEventDetail.matchDetail);
				break;
			default:
				break;
		}
		setTimeout(() => {
			cardEvent();
		}, ANIMATION_TIME);
	} else {
		setTimeout(() => {
			cardEvent();
		}, ANIMATION_TIME);
	}
}

function updateActivePlayer (activePlayer) {
	if (isRenderComplete()) {
		enableCards(activePlayer);
	} else {
		setTimeout(() => {
			updateActivePlayer(activePlayer);
		}, ANIMATION_TIME);
	}
}

// Any time a card is flipped, the round score values have changed, so update the numbers
function updatePlayerStrengthValues (matchDetail) {
	debugMode && console.log(`updatePlayerStrengthValues: ${JSON.stringify(matchDetail.roundStrength)}`);
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
		if (playerColor === winnerColor) {
			playSound(fanfare);
			// alert(`You win! (${matchDetail.scoreboard[winnerColor]} - ${matchDetail.scoreboard[loserColor]})`);
		} else if (playerColor === loserColor) {
			playSound(loser);
			// alert(`You lose. (${matchDetail.scoreboard[loserColor]} - ${matchDetail.scoreboard[winnerColor]})`);
		} else {
			// alert(`${winnerColor} wins! (${matchDetail.scoreboard[winnerColor]} - ${matchDetail.scoreboard[loserColor]})`);
		}
		renderRematchBlock();
	}, ANIMATION_TIME);

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

function exitMatch () {
	if (debugMode) console.log("%s(%s)", arguments.callee.name, Array.prototype.slice.call(arguments).sort());
	playerRoundStrength = 0;
	opponentRoundStrength = 5;
	socket.emit("leave match");
	labels["result"].visible = false;
	labels["main menu"].visible = false;
	labels["main menu"].clickable = false;
	labels["rematch"].visible = false;
	labels["rematch"].clickable = false;
	labels["rematch"].disabled = false;
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
