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
		// 'object:selected' : flipHandler // TODO: Change this to :flipped
	});

	ctx = canvas.getContext("2d");
	handleResize();

	let labelFont = '';

	labels["play"] = new Label({x: 0.5, y: 0.9}, "Play!", 144, true, true, false, labelFont, enterQueue);
	labels["searching"] = new Label({x: 0.5, y: 0.9}, "Searching   ", 144, false, false, false, labelFont);
	labels["result"] = new Label({x: 0.5, y: 0.2}, "", 192, false, false, false, labelFont);
	labels["rematch"] = new Label({x: 0.5, y: 0.9}, "Rematch", 128, false, false, false, labelFont, requestRematch);
	labels["waiting"] = new Label({x: 0.5, y: 0.9}, "Waiting   ", 128, false, false, false, labelFont);
	labels["main menu"] = new Label({x: 0.5, y: 0.7}, "Main Menu", 128, false, false, false, labelFont, exitMatch);
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

	canvas.setDimensions({
		width: newWidth,
		height: newHeight
	});
	canvas.calcOffset();
	canvas.renderAll();
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
var canvas, cardWidth, cardHeight;
let aspect = 7 / 5; // Play area aspect ratio (width / height)
let gridSpaces = [];
let gridCards = [];
let opponentCards = [];
let playerCards = [];
let labels = [];

// PROBABLY REMOVE THIS SPECIAL TREATMENT, AS IT SEEMS UNNECESSARY
let tierColorMap = [
	'', // There is no tier 0
	'#24b',
	'#24b',
	'#24b',
	'#24b',
	'#24b',
	'#94b',
	'#94b',
	'#94b',
	'#ccc',
	'#eb0',
];

init();

window.addEventListener("resize", handleResize, false);
setInterval(animateLabels, 300);

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
		evt.target.animate({shadow: '', left: dropTarget.left - cardWidth / 2, top: dropTarget.top}, {
			duration: 100,
			easing: fabric.util.ease.easeInOutExpo,
			onChange: canvas.renderAll.bind(canvas)
		});
		canvas.discardActiveObject(); // Deselect card after playing
		dropTarget.selectable = false; // Utilize selectable property to indicate full board spaces
		document.dispatchEvent(new CustomEvent('event:play-card', { 	detail: {
			cardIndex: evt.target.cardIndex,
			location: dropTarget.location
		}}));
	} else {
		// If we are not on top of a valid target, put the card back.
		evt.target.evented = true;
		evt.target.animate({shadow: '', left: evt.transform.original.left, top: evt.transform.original.top}, {
			duration: 200,
			easing: fabric.util.ease.easeInOutExpo,
			onChange: canvas.renderAll.bind(canvas)
		});
	}
};

// Given a hand card index and a location, move the given card, also revealing it, if a cardImageId is passed (always, for spectators or opponent's cards)
function moveCard (moveDetail) {
	let card = opponentCards.splice(moveDetail.cardIndexInHand, 1, undefined);
	console.log(opponentCards);

	// TODO: FIGURE: Consider if it is just better to use an object, so that there is no lookup needed, instead of an array
	let gridIndex;
	switch (moveDetail.location) {
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
			console.warn(`WARNING: card move to invalid space (${location}) attempted`);
			break;
	}

	if (card.length && gridIndex !== undefined) {
		// Disable the space that the moved card now occupies
		gridSpaces[gridIndex].selectable = false;
		gridCards[gridIndex] = card;
		card[0].cardImageId = moveDetail.cardImageId;
		card[0].gridIndex = gridIndex;
		card[0].animate({shadow: '', left: gridSpaces[gridIndex].left - cardWidth / 2, top: gridSpaces[gridIndex].top}, {
			duration: 500,
			easing: fabric.util.ease.easeInOutExpo,
			onChange: canvas.renderAll.bind(canvas),
			onComplete: fetchCardFace.bind(card[0])
		});
	}
}

// Swap card face image for card back
function fetchCardFace () {
	// debugger;
	fabric.Image.fromURL(`images/cards/${this.cardImageId}.png`, (img) => {
		img = img.scaleToWidth(cardWidth);
		this.addWithUpdate(img);
		flipCard(this);
	}, {
		left: this.left,
		top: this.top
	});
}

// When a card is revealed or changes colors, give it a 3D-like flip animation
function flipCard (cardToFlip) {
	// Scrunching up the element's width as part of the animation does not appear to work as expected
	cardToFlip.hasBorders = false;
	cardToFlip.setShadow({ blur: 7, color: 'rgba(0,0,0,0.3)', offsetX: 12, offsetY: 12 });
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
	}
}

// Render each card in a player's hand
function renderHand (cards, isOpponent) {
	if (!cards) {
		cards = [{}, {}, {}, {}, {}];
		isOpponent = true;
	}
	for (let i = 0; i < cards.length; i++) {
		renderCard(cards[i], i, isOpponent);
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

	if (isOpponent && !card.id) {
		fabric.Image.fromURL(`images/cards/back.png`, (img) => {
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

			opponentCards[slot] = cardGroup;
			canvas.add(cardGroup);
			canvas.renderAll();
		});
	} else {
		fabric.Image.fromURL(`images/cards/${card.id}.png`, (img) => {
			img = img.scaleToWidth(cardWidth);

			cardGroup = new fabric.Group([ img ], Object.assign({
				// backgroundColor: tierColorMap[card.tier] // AFTER CARDS HAVE TRANSPARENT BACKGROUNDS
				borderColor: tierColorMap[card.tier],
				// originX: 'center',
				// originY: 'center',
				// left: cardWidth,
				// top: slot * cardHeight / 2 + cardHeight,
				left: cardWidth / 10,
				top: (canvas.height - 20) / 7 + slot * cardHeight / 2,
			}, baseCardConfig));

			// Add card data to be used with card placement eventing
			cardGroup.cardIndex = slot;

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
	canvas.add(text);
	canvas.renderAll();
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
	canvas.clear();
	renderGameGrid();
	renderHand(cards);
	renderHand(); // Opponent's hand
}
