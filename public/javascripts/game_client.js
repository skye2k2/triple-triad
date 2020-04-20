// This file manages the games client's logic. It's here that Socket.io connections are handled and functions from canvas.js are used to manage the game's visual appearance.

let socket = io();
let canPlayCard = false;
let debugMode = true;
let playerPoints = 5;
let opponentPoints = 5;
let cardEventQueue = [];
let matchWinner, matchEndReason, readyToEnd, timerInterval;

//////////  Socket Events  \\\\\\\\\\
socket.on("enter match", function() {
	enterMatch();
});

socket.on("draw hand", function(cards) {
	console.log('io: draw hand --> canvas.startRound()');
	startRound(cards);
});

// Object format: {cardIndexInHand: 0, location: '1,1', color: 'red', cardImageId: '104'}
socket.on("card played", function(moveDetail) {
	cardEventQueue.push(moveDetail);
	if (cardEventQueue.length === 1) {
		cardPlayed();
	}
});

socket.on("card flipped", function(flipDetail) {
	cardFlipped(flipDetail);
});

socket.on("fight result", function(result) {
	displayResult(result);
});

socket.on("end match", function(winner, reason) {
	matchWinner = winner;
	matchEndReason = reason;
	readyToEnd = true;
	if (canPlayCard) {
		endMatch();
	}
});

socket.on("no rematch", function() {
	if (labels["waiting"].visible || labels["rematch"].visible) {
		labels["waiting"].visible = false;
		labels["rematch"].disabled = true;
		labels["rematch"].clickable = false;
		labels["rematch"].visible = true;
	}
});

// Catch the canvas play-card event, and send it on to Socket.io
document.addEventListener('event:play-card', playCard);

// TODO: Catch the canvas start match/rematch events, and send on to Socket.io

//////////  Functions  \\\\\\\\\\
function enterQueue() {
	if (debugMode) console.log("%s(%s)", arguments.callee.name, Array.prototype.slice.call(arguments).sort());
	socket.emit("enter queue");
	labels["play"].visible = false;
	labels["play"].clickable = false;
	labels["searching"].visible = true;
}

function enterMatch() {
	if (debugMode) console.log("%s(%s)", arguments.callee.name, Array.prototype.slice.call(arguments).sort());
	playerPoints = 5;
	opponentPoints = 5;
	cardEventQueue = [];

	labels["result"].visible = false;
	labels["main menu"].visible = false;
	labels["main menu"].clickable = false;
	labels["rematch"].visible = false;
	labels["rematch"].clickable = false;
	labels["rematch"].disabled = false;
	labels["waiting"].visible = false;
	resetDots(labels["waiting"]);
	labels["searching"].visible = false;
	resetDots(labels["searching"]);
	displayCardSlots = true;
}

function playCard(evt) {
	if (debugMode) console.log("event:play-card", evt.detail);

	socket.emit("play card", evt.detail.cardIndex, evt.detail.location);
}

function cardPlayed() {
	if (isRenderComplete() && cardEventQueue.length) {
		moveDetail = cardEventQueue.shift();
		console.log(`cardPlayed --> canvas.moveCard(${JSON.stringify(moveDetail)})`);
		if (moveDetail) {
			moveCard(moveDetail);
		}
		setTimeout(() => {
			cardPlayed();
		}, 600);
	} else {
		setTimeout(() => {
			cardPlayed();
		}, 600);
	}
}

function cardFlipped() {
	if (isRenderComplete() && cardEventQueue.length) {
		flipDetail = cardEventQueue.shift();
		console.log(`cardFlipped --> canvas.flipCard(${JSON.stringify(flipDetail)})`);
		if (flipDetail) {
			moveCard(flipDetail);
		}
		setTimeout(() => {
			cardFlipped();
		}, 600);
	} else {
		setTimeout(() => {
			cardFlipped();
		}, 600);
	}
}

function displayResult(result) {
	if (debugMode) console.log("%s(%s)", arguments.callee.name, Array.prototype.slice.call(arguments).sort());
	var player = undefined;
	var opponent = undefined;
	if (result.winner.socketId === socket.id) {
		player = result.winner;
		opponent = result.loser;
	} else {
		player = result.loser;
		opponent = result.winner;
	}
	playerPoints = player.points;
	opponentPoints = opponent.points;
	setTimeout(function() {
		if (readyToEnd) {
			endMatch();
		} else {
			canPlayCard = true;
			timerInterval = setInterval(updateTimer, 1000);
			canPlayCard = true;
			socket.emit("request cards update");
		}
	}, (2 * 1000));
}

function endMatch() {
	if (debugMode) console.log("%s(%s)", arguments.callee.name, Array.prototype.slice.call(arguments).sort());
	canPlayCard = false;
	readyToEnd = false;
	displayCardSlots = false;
	for (var i = 0; i < handSlots.length; i++) {
		handSlots[i].card = undefined;
	}

	if (matchEndReason === "player left") {
		var reason = ["Your opponent", "You"][+(socket.id !== matchWinner)] + " left the match";
		labels["rematch"].disabled = true;
		labels["rematch"].clickable = false;
	} else {
		var reason = ["Your opponent has", "You have"][+(socket.id === matchWinner)] + " a full set";
		labels["rematch"].clickable = true;
	}

	labels["result"].text = ["You Lose!", "You Win!"][+(socket.id === matchWinner)];
	labels["result"].visible = true;
	labels["rematch"].visible = true;
	labels["main menu"].visible = true;
	labels["main menu"].clickable = true;
	matchWinner = undefined;
	matchEndReason = undefined;
}

function exitMatch() {
	if (debugMode) console.log("%s(%s)", arguments.callee.name, Array.prototype.slice.call(arguments).sort());
	playerPoints = [];
	opponentPoints = [];
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

function requestRematch() {
	if (debugMode) console.log("%s(%s)", arguments.callee.name, Array.prototype.slice.call(arguments).sort());
	socket.emit("request rematch");
	labels["rematch"].visible = false;
	labels["rematch"].clickable = false;
	labels["waiting"].visible = true;
}

function animateLabels() {
	var dotLabels = [labels["waiting"], labels["searching"]];
	for (var i = 0; i < dotLabels.length; i++) {
		if (dotLabels[i].visible) {
			updateDots(dotLabels[i]);
		}
	}
}

function updateDots(label) {
	var dots = label.text.split(".").length - 1;
	var newDots = ((dots + 1) % 4);
	label.text = label.text.slice(0, -3) + Array(newDots + 1).join(".") + Array(3 - newDots + 1).join(" ");
}

function resetDots(label) {
	label.text = label.text.slice(0, -3) + "...";
}
