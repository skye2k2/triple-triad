// This file manages the game's logic for most visual things and contains various functions for drawing on and manipulating the canvas, used by the game client.

//////////  Constructors  \\\\\\\\\\
function Label(position, text, size, visible, clickable, disabled, font, callback) {
	if (debugMode) console.log("%s(%j)", arguments.callee.name, Array.prototype.slice.call(arguments).sort());

	//x and y are integers between 0 and 1. Use as percentages.
	this.position = position;
	this.text = text;
	this.size = size;
	this.visible = visible;
	this.clickable = clickable;
	this.disabled = disabled;
	this.down = false;
	this.font = font;
	this.callback = callback;
}

//////////  Canvas  \\\\\\\\\\
function init() {
	delete canvas;
	canvas = new fabric.Canvas('fabric-canvas', {
		// originX: 'center',
		// originY: 'center',
		// preserveObjectStacking: true, // This is *supposed* to keep elements from layering stupidly
		selection: false
	});

	canvas.on({
		'object:moving' : movingHandler,
		'object:modified' : modifiedHandler,
	});

	ctx = canvas.getContext("2d");

	let labelFont = '';

	handleResize();
}

//////////  Events  \\\\\\\\\\

function handleResize() {
	let newWidth;
	let newHeight;
	if (window.innerWidth < window.innerHeight * aspect) {
		newWidth = window.innerWidth * 0.9;
		newHeight = window.innerWidth * 0.9 / aspect;
		r = newWidth / 1000;
	} else {
		newWidth = window.innerHeight * 0.9 * aspect;
		newHeight = window.innerHeight * 0.9;
		r = newHeight * aspect / 1000;
	}
	cardWidth = 140 * r;
	cardHeight = cardWidth * 1.4;

	let oldWidth = canvas.getWidth() || newWidth;
	let scale = newWidth / oldWidth;
	zoom  = canvas.getZoom() * scale;
	// console.log('handleResize', zoom);

	canvas.setDimensions({
		width: newWidth,
		height: newHeight
	});
	// canvas.calcOffset();
	// canvas.renderAll();
	canvas.setViewportTransform([zoom, 0, 0, zoom, 0, 0]);
	// TODO: Fix card placement after resizing, so that the horizontal play grid still lines up correctly (multiply left offset by zoom?)
}

//////////  Drawing  \\\\\\\\\\
function draw() {
	// ctx.clearRect(0, 0, canvas.width, canvas.height);

	for (i in labels) {
		if (labels[i].visible) {
			drawLabel(labels[i]);
		}
	}
}

function drawLabel(label) {
	ctx.textBaseline = "middle";
	ctx.textAlign = "center";
	ctx.font = (label.size * r) + "px " + label.font;
	var shadowDistance = label.size / 30;
	if (!label.disabled) {
		ctx.fillStyle = "#9a9a9a";
		ctx.fillText(label.text, canvas.width * label.position.x + (shadowDistance * r), canvas.height * label.position.y + (shadowDistance * r));
		ctx.fillStyle = "#000000";
	} else {
		ctx.fillStyle = "#9a9a9a";
	}
	if (label.down) {
		ctx.fillText(label.text, canvas.width * label.position.x + (shadowDistance * 0.5 * r), canvas.height * label.position.y + (shadowDistance * 0.5 * r));
	} else {
		ctx.fillText(label.text, canvas.width * label.position.x, canvas.height * label.position.y);
	}
}

//////////  Initialize  \\\\\\\\\\
var canvas, cardWidth, cardHeight, gameNameText, playerRoundStrengthText, playerRunningScoreText, opponentRoundStrengthText, opponentRunningScoreText, botText, noButtonBlock, yesButtonBlock, stoplight, rematchBlock;
let aspect = 7 / 5; // Play area aspect ratio (width / height)
let gridSpaces = [];
let gridCards = [];
let opponentCards = [];
let playerCards = [];
let labels = [];
let zoom = 1;

init();

window.addEventListener("resize", handleResize, false);

// While dragging, disable eventing on the card we are moving so that findTarget triggers on the element beneath us
function movingHandler (evt) {
	evt.target.evented = false;
	evt.target.setShadow({ blur: 7, color: 'rgba(0,0,0,0.3)', offsetX: 12, offsetY: 12 });
	canvas.renderAll.bind(canvas);
}

// PlayCard: Handle card drag and drop
function modifiedHandler (evt) {
	let dropTarget = canvas.findTarget(evt.e);

	// If we are on top of an *empty* board space, position the card directly on top
	if (dropTarget && dropTarget.selectable && dropTarget.location) {
		playSound(play, 50);
		evt.target.animate({shadow: '', left: dropTarget.left - cardWidth / 2, top: dropTarget.top}, {
			duration: 100,
			easing: fabric.util.ease.easeInOutExpo,
			onChange: canvas.renderAll.bind(canvas)
		});
		canvas.discardActiveObject(); // Deselect card after playing
		dropTarget.selectable = false; // Utilize selectable property to indicate full board spaces

		gridCards[locationToGridIndex(dropTarget.location)] = evt.target;

		document.dispatchEvent(new CustomEvent('event:play-card', { detail: {
			cardIndex: evt.target.cardIndex,
			location: dropTarget.location
		}}));
	} else {
		// If we are not on top of a valid target, put the card back.
		playSound(play, 100);
		evt.target.evented = true;
		evt.target.animate({shadow: '', left: evt.transform.original.left, top: evt.transform.original.top}, {
			duration: 200,
			easing: fabric.util.ease.easeInOutExpo,
			onChange: canvas.renderAll.bind(canvas)
		});
	}
};

// Translate location string into grid index
function locationToGridIndex (location) {
	switch (location) {
		case '1,1':
			gridIndex = 0;
			break;
		case '1,2':
			gridIndex = 3;
			break;
		case '1,3':
			gridIndex = 6;
			break;
		case '2,1':
			gridIndex = 1;
			break;
		case '2,2':
			gridIndex = 4;
			break;
		case '2,3':
			gridIndex = 7;
			break;
		case '3,1':
			gridIndex = 2;
			break;
		case '3,2':
			gridIndex = 5;
			break;
		case '3,3':
			gridIndex = 8;
			break;
		default:
			console.warn(`WARNING: invalid location (${location}) referenced`);
			return false;
	}

	return gridIndex;
}

// Given a hand card index and a location, move the given card, also revealing it, if a cardImageId is passed (always, for spectators or opponent's cards)
function moveCard (moveDetail) {
	let card = (moveDetail.mine || moveDetail.spectator) ?
		playerCards.splice(moveDetail.cardIndexInHand, 1, undefined)[0] :
		opponentCards.splice(moveDetail.cardIndexInHand, 1, undefined)[0];

	// TODO: FIGURE: Consider if it is just better to use an object, so that there is no lookup needed, instead of an array
	let gridIndex = locationToGridIndex(moveDetail.location);
	if (card && gridIndex !== undefined) {
		// Disable the space that the moved card now occupies
		gridSpaces[gridIndex].selectable = false;
		gridCards[gridIndex] = card;
		card.evented = false;
		card.cardImageId = moveDetail.cardImageId;
		card.gridIndex = gridIndex;
		card.animate({shadow: '', left: gridSpaces[gridIndex].left - cardWidth / 2, top: gridSpaces[gridIndex].top}, {
			duration: 500,
			easing: fabric.util.ease.easeInOutExpo,
			onChange: canvas.renderAll.bind(canvas),
			onComplete: (moveDetail.mine && !moveDetail.spectator) ? undefined: fetchCardFace.bind(card)
		});
	}
}

// If you are the active player, enable interaction, otherwise disable
function enableCards (activePlayer) {
	if (activePlayer) {
		canvas.wrapperEl.removeAttribute('disabled');
	} else {
		canvas.wrapperEl.setAttribute('disabled', true);
	}
}

// Swap card face image for card back
function fetchCardFace () {
	fabric.Image.fromURL(`images/cards/${this.cardImageId}.png`, (img) => {
		img = img.scaleToWidth(cardWidth);
		img.filters = [new fabric.Image.filters.Grayscale()]; // Add flipping filter to every card
		this.addWithUpdate(img);
		flipCard(this);
	}, {
		left: this.left,
		top: this.top
	});
}

// When a card is revealed or changes colors, give it a 3D-like flip animation
// Can pass in either a card or its coordinates
function flipCard (cardToFlip) {
	if (typeof cardToFlip === 'string') {
		cardToFlip = gridCards[locationToGridIndex(cardToFlip)];
	}

	if (cardToFlip.mine) {
		// Catch the flip event correctly for spectators, and then remove the short-circuit
		delete cardToFlip.mine;
		cardToFlip.color = 'blue'; // When spectating, assume the player is blue
	} else {
		if (cardToFlip.color) {
			cardToFlip.color = (cardToFlip.color === 'red') ? 'blue' : 'red';
		} else {
			cardToFlip.color = (playerColor === 'red') ? 'blue' : 'red';
		}
	}

	let imageToFilter = (cardToFlip._objects && (cardToFlip._objects[1] || cardToFlip._objects[0]));
	if (cardToFlip.color === playerColor) {
		imageToFilter.applyFilters([]); // Cheap way to clear filters, since we don't know if any filters are currently being applied
	} else {
		imageToFilter.applyFilters();
	}

	// NOTE: Scrunching up the element's width as part of the animation does not appear to work as expected
	cardToFlip.hasBorders = false;

	canvas.renderAll();

	cardToFlip.setShadow({ blur: 7, color: 'rgba(0, 0, 0, 0.3)', offsetX: 12, offsetY: 12 });
	cardToFlip.animate({left: cardToFlip.left - cardWidth / 2, skewX: cardWidth / 5, skewY: cardHeight / 3, width: cardWidth / 2}, {
		duration: 100,
		easing: fabric.util.ease.easeInExpo,
		onChange: canvas.renderAll.bind(canvas),
		onComplete: undoAnimate.bind(cardToFlip)
	});
	function undoAnimate () {
		canvas.renderAll();
		this.hasBorders = true;
		this.animate({shadow: '', left: this.left + cardWidth / 2, skewX: 0, skewY: 0, width: cardWidth}, {
			duration: 100,
			easing: fabric.util.ease.easeOutExpo,
			onChange: canvas.renderAll.bind(canvas)
		});
		playSound(flip);
	}
}

// Render the active player indicator icon
// function renderActivePlayerIndicator () {
	// fabric.Image.fromURL(`images/indicator.png`, (img) => {
	// 	img = img.scaleToWidth(cardWidth / 2);
	// 	img.top = (canvas.height - 20) / 7 - img.getScaledHeight();

	// 	activePlayerIndicator = img;
	// 	canvas.add(activePlayerIndicator);
	// 	canvas.renderAll();
	// }, {
	// 	evented: false,
	// 	hasControls: false,
	// 	left: canvas.width - (cardWidth + cardWidth / 10)
	// });
// }

// Render each card in a player's hand
function renderHand (cards, isOpponent) {
	playSound(deal);

	if (!cards) {
		cards = [{}, {}, {}, {}, {}];
		isOpponent = true;
	} else if (cards === true) {
		cards = [{}, {}, {}, {}, {}];
		isOpponent = false;
	}
	for (let i = 0; i < cards.length; i++) {
		renderCard(cards[i], i, isOpponent);
	}

	restackCanvasElements();
}

// Cards and board are not guaranteed to load in ascending order, so force it
function restackCanvasElements () {
	if (playerCards.length !== 5 && opponentCards !== 5) {
		// console.log('WAIT: restackCanvasElements', playerCards.length, opponentCards.length);
		setTimeout(() => {
			restackCanvasElements();
		}, 500);
	} else {
		// console.log(`restackCanvasElements`);
		for (let i = playerCards.length -1; i >= 0; i--) {
			if (playerCards[i]) {
				playerCards[i].sendToBack();
			}
		}
		for (let i = opponentCards.length - 1; i >= 0; i--) {
			if (opponentCards[i]) {
				opponentCards[i].sendToBack();
			}
		}
		// Position game grid and text behind all other game components
		gameNameText.sendToBack();
		for (let i = 0; i < gridSpaces.length; i++) {
			gridSpaces[i].sendToBack();
		}
	}
}

// Render card in its specified hand slot
function renderCard (card, slot, isOpponent) {
	let baseCardConfig = {
		borderScaleFactor: 3,
		hasControls: false,
		height: cardHeight,
		// lockSkewingY: true,
		width: cardWidth
	};
	let cardGroup;

	if (!card) {return console.log(`ERROR rendering card[${slot}] for ${(isOpponent) ? 'opponent' : 'player'}`);}

	let cardURL = (isOpponent || !card.id) ? `images/cards/back.png` : `images/cards/${card.id}.png`;

	if (isOpponent && !card.id) {
		fabric.Image.fromURL(cardURL, (img) => {
			img = img.scaleToWidth(cardWidth);
			// In theory, we could invert the opponent's cards
			// img.filters.push(new fabric.Image.filters.Invert());
			// img.applyFilters(canvas.renderAll.bind(canvas));

			cardGroup = new fabric.Group([ img ], Object.assign({
				evented: false,
				left: canvas.width - (cardWidth + cardWidth / 10),
				top: (canvas.height - 20) / 7 + slot * cardHeight / 2,
			}, baseCardConfig));

			// Add card data to be used with card placement eventing
			cardGroup.cardIndex = slot;

			// console.log(`renderCard (opponent): ${slot}`);

			opponentCards[slot] = cardGroup;
			canvas.add(cardGroup);
			canvas.renderAll();
		});
	} else {
		fabric.Image.fromURL(cardURL, (img) => {
			img = img.scaleToWidth(cardWidth);
			img.filters = [new fabric.Image.filters.Grayscale()]; // Add flipping filter to every card
			cardGroup = new fabric.Group([ img ], Object.assign({
				borderColor: '#24b',
				evented: (!card.id) ? false : true,
				// originX: 'center',
				// originY: 'center',
				// left: cardWidth,
				// top: slot * cardHeight / 2 + cardHeight,
				left: cardWidth / 10,
				top: (canvas.height - 20) / 7 + slot * cardHeight / 2,
			}, baseCardConfig));

			// Add card data to be used with card placement eventing
			cardGroup.cardIndex = slot;
			cardGroup.color = (isOpponent) ? opponentColor : playerColor;
			cardGroup.mine = spectator;

			// console.log(`renderCard (player): ${slot}`);

			playerCards[slot] = cardGroup;
			canvas.add(cardGroup);
			canvas.renderAll();
		});
	}
}

// Create the grid where cards are played
function renderGameGrid () {
	gridSpaces = [];
	let gridBaseConfig = {
		fill: false,
		height: cardHeight,
		opacity: 0.1,
		stroke: '#000',
		width: cardWidth,
	};
	let cornerArtWidth = cardWidth / 2;

	// Load the corner art image once, and then clone it when needed in each grid space
	fabric.Image.fromURL('images/corner-art.png', (cornerImg) => {
		cornerImg = cornerImg.scaleToWidth(cornerArtWidth);
		let gridGroupArray = [];

		// 3x3
		for (let i = 1; i < 4; i++) {
			for (let j = 1; j < 4; j++) {
				let gridSpace = new fabric.Rect(Object.assign({
				}, gridBaseConfig));
				let gridSpaceGroupArray = [gridSpace];

				// Spaces 2, 4, 6, & 8 have no corner art, at all

				// Spaces 1, 5, and 9 have NW/SE corner art
				if (i === j) {
					cornerImg.cloneAsImage((SE) => {
						SE.left = cardWidth / 2;
						SE.top = cardHeight / 1.55;
						gridSpaceGroupArray.push(SE);
					});

					cornerImg.cloneAsImage((NW) => {
						NW.left = cornerArtWidth;
						NW.top = cornerArtWidth;
						NW.angle = 180;
						gridSpaceGroupArray.push(NW);
					});
				}

				// Spaces 3, 5, and 7 have NE/SW corner art
				if (j === 3 && i === 1 ||
					j === 2 && i === 2 ||
					j === 1 && i === 3) {
						cornerImg.cloneAsImage((SW) => {
							SW.left = 0;
							SW.top = cardHeight - cornerArtWidth;
							SW.flipX = true,
							gridSpaceGroupArray.push(SW);
						});

						cornerImg.cloneAsImage((NE) => {
							NE.left = cornerArtWidth;
							NE.top = 0;
							NE.flipY = true,
							gridSpaceGroupArray.push(NE);
						});
				}

				let gridSpaceGroup = new fabric.Group(gridSpaceGroupArray, {
					centeredRotation: true,
					hasControls: false,
					height: cardHeight,
					hoverCursor: 'default',
					lockMovementX: true,
					lockMovementY: true,
					originX: 'center',
					// originY: 'center',
					left: i * cardWidth + cardWidth * 1.5,
					top: j * cardHeight - cardHeight / 2,
					width: cardWidth
				});

				// Add grid location data to be used with card placement eventing
				gridSpaceGroup.location = `${j},${i}`;

				gridSpaces.push(gridSpaceGroup);
				gridGroupArray.push(gridSpaceGroup);
				canvas.add(gridSpaceGroup);
			}
		}

		// IF NEEDED: A NESTED GROUP APPEARS TO BREAK SELECTABILITY, SO IF WE WANT BEAUTIFUL CENTERING, FIGURE OUT HOW TO SKIP SELECTION ON THE GROUP WRAPPER
		// let gridGroup = new fabric.Group(gridGroupArray, {
		// 	hasControls: false,
		// 	height: cardHeight * 3,
		// 	hoverCursor: 'default',
		// 	lockMovementX: true,
		// 	lockMovementY: true,
		// 	originX: 'center',
		// 	originY: 'center',
		// 	selectable: false,
		// 	top: canvas.height / 2,
		// 	width: cardWidth * 3
		// });
		// canvas.add(gridGroup);
	});
	renderGameText();
}

function renderGameText () {
	let text = new fabric.Text('Triple Triad', {
		evented: false,
		fill: '#333',
		fontFamily: 'Comic Sans MS, cursive, sans-serif',
		hasControls: false,
		left: canvas.width / 2.05,
		top: canvas.height / 1.85,
		originX: 'center',
		originY: 'center',
		textAlign: 'center',
	});
	text = text.scaleToWidth(cardWidth * 2.5);
	gameNameText = text;
	canvas.add(text);
	canvas.renderAll();
}

function renderPlayerScore (score, isOpponent) {
	score = score.toString();

	let text = new fabric.Text(score, {
		evented: false,
		fill: '#333',
		fontFamily: 'Comic Sans MS, cursive, sans-serif',
		hasControls: false,
		left: (isOpponent) ? canvas.width - cardWidth / 2 : cardWidth / 2,
		strokeWidth: 0.5,
		top: 0,
		originX: 'center',
		originY: 'top',
		textAlign: 'center',
	});
	text = text.scaleToWidth(cardWidth / 3);

	if (isOpponent) {
		if (opponentRoundStrengthText) {
			opponentRoundStrengthText.text = score;
		} else {
			opponentRoundStrengthText = text;
			opponentRoundStrengthText.stroke = opponentColor;
			canvas.add(text);
		}

		botText = new fabric.Text(opponentBotLevel, {
			evented: false,
			fill: '#333',
			fontFamily: 'Comic Sans MS, cursive, sans-serif',
			hasControls: false,
			left: canvas.width - cardWidth / 2,
			strokeWidth: 1,
			originX: 'center',
			originY: 'center',
			textAlign: 'center',
		});
		botText.top = opponentRoundStrengthText.height * opponentRoundStrengthText.scaleY;
		botText = botText.scaleToWidth(cardWidth / 3);
		canvas.add(botText);
	} else {
		if (playerRoundStrengthText) {
			playerRoundStrengthText.text = score;
		} else {
			playerRoundStrengthText = text;
			playerRoundStrengthText.stroke = playerColor;
			canvas.add(text);
		}
	}

	canvas.renderAll();
}

function renderPlayerRunningScore (score = '', isOpponent) {
	// console.log(`renderPlayerRunningScore ${score}`);
	score = score.toString();

	let text = new fabric.Text(score, {
		evented: false,
		fill: '#333',
		fontFamily: 'Comic Sans MS, cursive, sans-serif',
		hasControls: false,
		left: (isOpponent) ? canvas.width / 2 + cardWidth : canvas.width / 2 - cardWidth,
		stroke: '#333',
		strokeWidth: 1,
		top: 10,
		originX: 'center',
		originY: 'top',
		textAlign: 'center',
	});

	text = text.scaleToHeight(cardWidth / 4);

	if (isOpponent) {
		if (opponentRunningScoreText) {
			opponentRunningScoreText.text = score;
		} else {
			opponentRunningScoreText = text;
			canvas.add(text);
		}
	} else {
		if (playerRunningScoreText) {
			playerRunningScoreText.text = score;
		} else {
			playerRunningScoreText = text;
			canvas.add(text);
		}
	}

	canvas.renderAll();
}

function renderRematchBlock () {
	let text = new fabric.Text('Rematch?', {
		evented: false,
		fill: '#333',
		fontFamily: 'Comic Sans MS, cursive, sans-serif',
		left: cardWidth / 2,
		originX: 'center',
		originY: 'center',
		textAlign: 'center',
	});

	text = text.scaleToWidth(cardWidth * 2.5);

	let yesText = new fabric.Text('Yes', {
		fill: '#333',
		fontFamily: 'Comic Sans MS, cursive, sans-serif',
		originX: 'center',
		originY: 'center',
	});

	yesText = yesText.scaleToHeight(cardWidth / 2);

	let yesButton = new fabric.Rect({
		fill: 'green',
		height: cardWidth / 2,
		originX: 'center',
		originY: 'center',
		stroke: '#000',
		strokeWidth: 1,
		width: cardWidth,
	});

	yesButtonBlock = new fabric.Group([ yesButton, yesText ], {
		left: - cardWidth,
		shadow: { blur: 5, color: 'rgba(0,0,0,0.3)', offsetX: 3, offsetY: 3 },
		top: text.getScaledHeight() / 2,
		value: 'yes'
	});

	let noText = new fabric.Text('No', {
		fill: '#333',
		fontFamily: 'Comic Sans MS, cursive, sans-serif',
		hasControls: false,
		originX: 'center',
		originY: 'center',
	});

	noText = noText.scaleToHeight(cardWidth / 2);

	let noButton = new fabric.Rect({
		fill: 'red',
		height: cardWidth / 2,
		originX: 'center',
		originY: 'center',
		stroke: '#000',
		strokeWidth: 1,
		width: cardWidth,
	});

	noButtonBlock = new fabric.Group([ noButton, noText ], {
		left: cardWidth,
		shadow: { blur: 5, color: 'rgba(0,0,0,0.3)', offsetX: 3, offsetY: 3 },
		top: text.getScaledHeight() / 2,
		value: 'no'
	});

	let rematchBackground = new fabric.Rect({
		fill: '#da4',
		height: cardWidth * 1.5,
		left: cardWidth / 2,
		originX: 'center',
		originY: 'center',
		stroke: '#000',
		strokeWidth: 1,
		top: cardWidth / 4,
		width: cardWidth * 4,
	});

	// TODO: Add a minimize button that animates the rematchBlock down off the screen, and adds a restore dialog button (probably with a refresh symbol, of some sort)

	rematchBlock = new fabric.Group([ rematchBackground, text, noButtonBlock, yesButtonBlock ], {
		borderColor: 'transparent',
		hasControls: false,
		hoverCursor: 'default',
		left: canvas.width / 2,
		lockMovementX: true,
		// lockMovementY: true,
		originX: 'center',
		originY: 'center',
		subTargetCheck: true,
		textAlign: 'center',
		top: canvas.height / 1.85
	});
	canvas.add(rematchBlock);

	rematchBlock.on('mousedown', function (evt) {
		// If a button was clicked, fire off an event and add a treatment to know which button was clicked
		if (evt.subTargets[0] && evt.subTargets[0].value) {
			document.dispatchEvent(new CustomEvent('event:rematch', { detail: evt.subTargets[0].value }));

			noButtonBlock.setShadow({ blur: 5, color: 'rgba(0,0,0,0.3)', offsetX: 3, offsetY: 3 });
			yesButtonBlock.setShadow({ blur: 5, color: 'rgba(0,0,0,0.3)', offsetX: 3, offsetY: 3 });
			evt.subTargets[0].setShadow({ blur: 5, color: 'rgba(0,0,0,0.3)', offsetX: -3, offsetY: -3 });
			canvas.renderAll();

			if (evt.subTargets[0].value === 'no') {
				setTimeout(() => {
					canvas.remove(rematchBlock);
				}, 500);
			}
		}
	});
	canvas.renderAll();
}

function renderScoreStoplight () {
	let circleBaseConfig = {
		fill: false,
		radius: cardWidth / 10,
		stroke: '#000',
		strokeWidth: 1
	};

	let circle1 = new fabric.Circle(Object.assign({
		left: 0
	}, circleBaseConfig));

	let circle2 = new fabric.Circle(Object.assign({
		left: cardWidth / 10 * 2 + 3
	}, circleBaseConfig));

	let circle3 = new fabric.Circle(Object.assign({
		left: cardWidth / 10 * 4 + 6
	}, circleBaseConfig));

	stoplight = new fabric.Group([ circle1, circle2, circle3 ], {
		evented: false,
		hasControls: false,
		left: canvas.width / 2,
		opacity: 0.6,
		originX: 'center',
		originY: 'top',
		top: 10
	});

	canvas.add(stoplight);

	// Empty round indicator circles on round start/restart
	if (playerRoundScore === 0 && opponentRoundScore === 0) {
		stoplight.item(0).set({fill: false});
		stoplight.item(1).set({fill: false});
		stoplight.item(2).set({fill: false});
	}
	// or fill in round indicator circles
	if (playerRoundScore > 0) {
		stoplight.item(0).set({fill: playerColor});

		if (playerRoundScore > 1) {
			stoplight.item(1).set({fill: playerColor});
		}
	}
	if (opponentRoundScore > 0) {
		stoplight.item(2).set({fill: opponentColor});

		if (opponentRoundScore > 1) {
			stoplight.item(1).set({fill: opponentColor});
		}
	}

	// TODO: Display Match ID underneath stoplight

	renderPlayerRunningScore(playerRunningScore);
	renderPlayerRunningScore(opponentRunningScore, true);

	// BUG: Running scores do not display high enough, despite rendering last, until wrapped in a timeout
	setTimeout(() => {
		playerRunningScoreText.bringToFront();
		opponentRunningScoreText.bringToFront();
		canvas.renderAll();
	}, 0);
}

// Keep from attempting to render card plays until the game is set up
function isRenderComplete () {
	return playerCards.length && opponentCards.length && gridSpaces.length
}

// (function render() {
// 	canvas.renderAll();
// 	fabric.util.requestAnimFrame(render);
// })();

function startRound (cards, opponentCards) {
	playerCards = [];
	playerRoundStrengthText = null;
	botText = null;
	opponentCards = [];
	opponentRoundStrengthText = null;
	canvas.clear();
	renderGameGrid();
	renderHand(cards);
	renderHand(); // Opponent's hand
	renderPlayerScore(5);
	renderPlayerScore(5, true); // Opponent's round score
	renderScoreStoplight();
}
