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
	handSlots = [];
	for (var i = 1; i < 6; i++) {
		handSlots.push({
			position: {
				x: canvas.width / 6 * i - cardWidth / 2,
				y: canvas.height - cardHeight * 1.1
			},
			card: undefined
		});
	}

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
	if (handSlots) {
		for (var i = 1; i < 6; i++) {
			handSlots[i-1].position = {
				x: canvas.width / 6 * i - cardWidth / 2,
				y: canvas.height - cardHeight * 1.1
			};
		}
	}
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

var handSlots, canvas, ctx, horizontalCenter, verticalCenter, clickPos, clickedCard, cardWidth, cardHeight;
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
	selection: false
});

// Render card in its specified hand slot
function renderCard (card, slot) {
	fabric.Image.fromURL(`images/cards/${card.name}.png`, (img) => {
		img = img.scaleToWidth(cardWidth);

		var cardGroup = new fabric.Group([ img ], {
			// evented: false, // USE TO DISABLE CARDS
			// shadow: fabric.Shadow() // USE WHEN DRAGGING
			// backgroundColor: tierColorMap[card.tier] // AFTER CARDS HAVE TRANSPARENT BACKGROUNDS
			borderColor: tierColorMap[card.tier],
			borderScaleFactor: 3,
			hasControls: false,
			height: cardHeight,
			left: cardWidth / 10,
			top: (canvas.height - 20) / 7 + slot * cardHeight / 2,
			width: cardWidth
		});

		canvas.add(cardGroup);
	});
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

	// 3x3
	for (let i = 1; i < 4; i++) {
		for (let j = 1; j < 4; j++) {
			fabric.Image.fromURL('images/corner-art.png', (cornerImg) => {
				cornerImg = cornerImg.scaleToWidth(cornerArtWidth);

				let gridSpace = new fabric.Rect(Object.assign({

				}, gridBaseConfig));
				let groupArray = [gridSpace]

				// Spaces 2, 4, 6, & 8 have no corner art, at all

				// Spaces 1, 5, and 9 have NW/SE corner art
				if (i === j) {
					cornerImg.cloneAsImage((SE) => {
						SE.left = cardWidth / 2;
						SE.top = cardHeight / 1.55;
						groupArray.push(SE);
					});

					cornerImg.cloneAsImage((NW) => {
						NW.left = cornerArtWidth;
						NW.top = cornerArtWidth;
						NW.angle = 180;
						groupArray.push(NW);
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
							groupArray.push(SW);
						});

						cornerImg.cloneAsImage((NE) => {
							NE.left = cornerArtWidth;
							NE.top = 0;
							NE.flipY = true,
							groupArray.push(NE);
						});
				}

				var gridGroup = new fabric.Group(groupArray, {
					centeredRotation: true,
					hasControls: false,
					height: cardHeight,
					hoverCursor: 'default',
					lockMovementX: true,
					lockMovementY: true,
					// TODO: CENTER THIS PERFECTLY IN THE CANVAS, EITHER WITH TRANSFORM PARAMETERS, OR EXPLICIT WIDTH & HEIGHT CALCULATIONS
					originX: 'center',
					left: i * cardWidth + cardWidth,
					top: j * cardHeight - cardHeight / 2,
					width: cardWidth
				});

				canvas.add(gridGroup);
			});
		}
	}
}

renderCard({tier: 10, north: 10, east: 9, south: 8, west: 7, name: 'Squall Leonhart'}, 0)
renderCard({tier: 10, north: 10, east: 9, south: 8, west: 7, name: 'Squall Leonhart'}, 1);
renderCard({tier: 10, north: 10, east: 9, south: 8, west: 7, name: 'Squall Leonhart'}, 2);
renderCard({tier: 10, north: 10, east: 9, south: 8, west: 7, name: 'Squall Leonhart'}, 3);
renderCard({tier: 10, north: 10, east: 9, south: 8, west: 7, name: 'Squall Leonhart'}, 4);

renderGameGrid();
