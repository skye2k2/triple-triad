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
	if (debugMode) console.log("%s(%j)", arguments.callee.name, Array.prototype.slice.call(arguments).sort());
	canvas = document.getElementById("fabric-canvas");
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

function animate() {
	requestAnimFrame(animate);
	draw();
}

//////////  Events  \\\\\\\\\\


function handleResize() {
	if (debugMode) console.log("%s(%j)", arguments.callee.name, Array.prototype.slice.call(arguments).sort());
	if (window.innerWidth < window.innerHeight * aspect) {
		canvas.width = window.innerWidth * 0.9;
		canvas.height = window.innerWidth * 0.9 / aspect;
		r = canvas.width / 1000;
	} else {
		canvas.width = window.innerHeight * 0.9 * aspect;
		canvas.height = window.innerHeight * 0.9;
		r = canvas.height * aspect / 1000;
	}
	cardWidth = 140 * r;
	cardHeight = cardWidth * 1.4;

	playerCardPosition = {x: canvas.width * 0.17, y: canvas.height * 0.15};
	opponentCardPosition = {x: canvas.width * 0.83 - cardWidth * 1.5, y: canvas.height * 0.15};
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
window.requestAnimFrame = (function () {
	return window.requestAnimationFrame ||
		window.webkitRequestAnimationFrame ||
		window.mozRequestAnimationFrame ||
		window.oRequestAnimationFrame ||
		window.msRequestAnimationFrame ||
		function (callback, element) {
			window.setTimeout(callback, 1000 / 60);
		};
})();

var canvas, ctx, horizontalCenter, verticalCenter, clickPos, clickedCard, cardWidth, cardHeight;
let clickCursor = false;
let displayCardSlots = false;
let aspect = 7 / 5; // Play area aspect ratio
let labels = [];

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
animate();

window.addEventListener("resize", handleResize, false);
setInterval(animateLabels, 300);

var canvas = new fabric.Canvas('fabric-canvas', {
	// originX: 'center',
	// originY: 'center',
	// preserveObjectStacking: true, // This is *supposed* to keep elements from layering stupidly
	selection: false
});

canvas.on({
	'object:moving' : movingHandler,
	'object:modified' : modifiedHandler,
	'object:selected' : flipHandler // TODO: Change this to :flipped
});

// When a card changes colors, give it a 3D-like flip animation
function flipHandler (evt) {
	// Scrunching up the element's width does not appear work as expected
	evt.target.setShadow({ blur: 7, color: 'rgba(0,0,0,0.3)', offsetX: 12, offsetY: 12 });
	evt.target.animate({left: evt.target.left - cardWidth / 2, skewX: cardWidth / 5, skewY: cardHeight, width: cardWidth / 2}, {
		duration: 100,
		easing: fabric.util.ease.easeInExpo,
		onChange: canvas.renderAll.bind(canvas),
		onComplete: undoAnimate.bind(evt.target)
	});
	// evt.target.scaleToHeight(2);
	function undoAnimate () {
		canvas.renderAll();
		this.animate({shadow: '', left: this.left + cardWidth / 2, skewX: 0, skewY: 0, width: cardWidth}, {
			duration: 100,
			easing: fabric.util.ease.easeOutExpo,
			onChange: canvas.renderAll.bind(canvas)
		});
	}
}

// While dragging, disable eventing on the card we are moving so that findTarget triggers on the element beneath us
function movingHandler (evt) {
	evt.target.evented = false;
	evt.target.setShadow({ blur: 7, color: 'rgba(0,0,0,0.3)', offsetX: 12, offsetY: 12 });
	canvas.renderAll.bind(canvas);
}

// Handle card drag and drop
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
		document.dispatchEvent(new CustomEvent('event:play-card', { detail: { cardIndex: evt.target.cardIndex, location: dropTarget.location }}));
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

// Render each card in a player's hand
function renderHand (cards, opponent) {
	if (!cards) {
		cards = [{}, {}, {}, {}, {}];
		opponent = true;
	}
	for (let i = 0; i < cards.length; i++) {
		renderCard(cards[i], i, opponent);
	}
}

// Render card in its specified hand slot
function renderCard (card, slot, opponent) {
	let baseCardConfig = {
		borderScaleFactor: 3,
		hasControls: false,
		height: cardHeight,
		// lockSkewingY: true,
		skewX: 0,
		width: cardWidth
	};
	let cardGroup;

	if (opponent && !card.id) {
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

			canvas.add(cardGroup);
			canvas.renderAll();
		});
	}
}

// Create the grid where cards are played
function renderGameGrid () {
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

function renderGameText() {
	let text = new fabric.Text('Triple Triad', {
		evented: false,
		fill: '#333',
		fontFamily: 'Comic Sans MS, cursive, sans-serif',
		hasControls: false,
		left: canvas.width / 2,
		top: canvas.height / 2,
		originX: 'center',
		originY: 'center',
		textAlign: 'center',
	});
	text = text.scaleToWidth(cardWidth * 2.5);
	canvas.add(text);
	canvas.renderAll();
}

function startRound (cards, opponentCards) {
	canvas.clear();
	renderGameGrid();
	renderHand(cards);
	renderHand(opponentCards); // Opponent's hand
}
