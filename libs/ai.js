// This file handles all AI-related game functions
// NOTE: Yes, we could have a significantly more intelligent AI if we tracked state across turns, but this would dramatically increase server load and overhead. Consider using the event log, for now, to determine who played what cards, and thus, the odds of the strength of remaining cards.

/**
 * "BASIC" AI LOGIC:
 * If I am playing the first card of the round, just play my lowest card in the center
 * Find all open board locations
 * Find and try high-impact locations (where the location borders more than one opponent-owned card)
 * Find and try attackable single cards
 * Default: Play lowest card in a random available space
 */


let cards = require("./cards");
let debugMode = true;

let ai = {
	// The game manager needs access to the card list to generate matched decks, and the AI obviously needs access to the card stats to do analysis, so we load it here as the single source of truth
	cardList: cards,

	// Since we always need to indicate the card and the location, provide a standardized function for it
	formatPlay: function (match, myIndex, cardIndex, location) {
		return {
			socket: match.players[myIndex].socket,
			cardIndex: cardIndex,
			location: location
		}
	},

	// Prefix and log messages, as necessary
	log: function (logString, match, myIndex) {
		logString = ` - ${match.players[myIndex].color} AI: ${logString}`;

		// if (match) {
		// 	match.log.push(logString);
		// }
		if (debugMode) {
			console.log(logString);
		}
	},

	// Primary logic
	play: function (match, myIndex) {
		if (typeof myIndex === 'object') {
			myIndex = match.players.indexOf(myIndex);
		}

		let bestCardIndex = this.determineMinMaxCard(match, myIndex, 'best');
		let worstCardIndex = this.determineMinMaxCard(match, myIndex, 'worst');

		// If I am playing the first card of the round, just play my lowest card in the center
		if (this.isBoardEmpty(match)) {
			this.log(`board is empty--playing worst card in the center`, match, myIndex);
			return this.formatPlay(match, myIndex, worstCardIndex, '2,2');
		}

		let potentialMoves = {
			highValue: [],
			successful: [],
			unsuccessful: []
		};
		let priorityTargets;
		let boardAnalysis = this.parseGameBoard(match, myIndex);

		// console.log(boardAnalysis);

		// If there is overlap between high-value attack and high-value defense spaces, play my best card
		if (boardAnalysis.highValueAttackSpaces.length && boardAnalysis.highValueDefenseSpaces.length) {
			priorityTargets = boardAnalysis.highValueAttackSpaces.filter(value => boardAnalysis.highValueDefenseSpaces.includes(value));
			if (priorityTargets.length) {
				this.log(`playing best card in an ultra high-value attackable/defendable space`, match, myIndex);
				return this.formatPlay(match, myIndex, bestCardIndex, priorityTargets[0]);
			}
		}

		// If there are high-value attackable spaces, play my best card
		if (boardAnalysis.highValueAttackSpaces.length) {
			priorityTargets = boardAnalysis.highValueAttackSpaces.filter(value => boardAnalysis.defendableSpaces.includes(value));
			if (priorityTargets.length) {
				this.log(`playing best card in a doubly high-value attackable/defendable space`, match, myIndex);
				return this.formatPlay(match, myIndex, bestCardIndex, priorityTargets[0]);
			} else {
				this.log(`playing best card in a high-value attackable space`, match, myIndex);
				return this.formatPlay(match, myIndex, bestCardIndex, this.pickRandomItem(boardAnalysis.highValueAttackSpaces));
			}
		}

		// If there are no high-value attackable spaces, play in a defensible position to keep cards I own
		if (boardAnalysis.highValueDefenseSpaces.length) {
			priorityTargets = boardAnalysis.highValueDefenseSpaces.filter(value => boardAnalysis.attackableSpaces.includes(value));
			if (priorityTargets.length) {
				this.log(`playing worst card in a doubly high-value defendable/attackable space`, match, myIndex);
				return this.formatPlay(match, myIndex, worstCardIndex, priorityTargets[0]);
			} else {
				this.log(`playing worst card in a high-value defendable space`, match, myIndex);
				return this.formatPlay(match, myIndex, worstCardIndex, this.pickRandomItem(boardAnalysis.highValueDefenseSpaces));
			}
		}

		// If there are standard attackable spaces, play my worst card to attack
		if (boardAnalysis.attackableSpaces.length) {
			// Try each card in hand, to see which result in a successful attack
			// Then use the lowest-ranked option (future: that is reasonably safe)
			// for (let i = 0; i < boardAnalysis.attackableSpaces.length; i++) {
			// 	for (let j = 0; j < match.players[myIndex].cards.length; j++) {
			// 		if (match.players[myIndex].cards[j])
			// 		let captures = playCard(match.players[myIndex].socket, match.players[myIndex].cards[j], boardAnalysis.attackableSpaces[i], 'preview');
			// 		if (captures.length > 1) {
			// 			potentialMoves.highValue.push({cardIndex: j, location: boardAnalysis.attackableSpaces[i]});
			// 		} else if (captures.length > 0) {
			// 			potentialMoves.successful.push({cardIndex: j, location: boardAnalysis.attackableSpaces[i]});
			// 		} else {
			// 			potentialMoves.unsuccessful.push({cardIndex: j, location: boardAnalysis.attackableSpaces[i]});
			// 		}
			// 	}
			// }
			this.log(`playing worst card in a random attackable space`, match, myIndex);
			return this.formatPlay(match, myIndex, worstCardIndex, this.pickRandomItem(boardAnalysis.attackableSpaces));
		}

		// If there are no attackable spaces, play in a defensible position to keep cards I own
		if (boardAnalysis.defendableSpaces.length) {
			this.log(`playing worst card in a defendable space`, match, myIndex);
			return this.formatPlay(match, myIndex, worstCardIndex, this.pickRandomItem(boardAnalysis.defendableSpaces));
		}

		// If there are no appealing options, just play my lowest card in an available space
		// TODO: OR play a high-defense card in its power corner
		if (boardAnalysis.openSpaces.length) {
			this.log(`no good options--playing worst card in a random open space`, match, myIndex);
			return this.formatPlay(match, myIndex, worstCardIndex, this.pickRandomItem(boardAnalysis.openSpaces));
		} else {
			this.log(`ERROR: no open spaces`, match, myIndex);
		}
	},

	pickRandomItem: function (array) {
		let randomIndex = Math.floor(Math.random() * (array.length));
		return array[randomIndex];
	},

	// Parse game board to index all open board locations, occupied locations, and attackable locations
	parseGameBoard: function (match, myIndex) {
		let parsedGameBoard = {
			attackableSpaces: [],
			defendableSpaces: [],
			highValueAttackSpaces: [],
			highValueDefenseSpaces: [],
			openSpaces: [],
			opponentOwnedSpaces: [],
			ownedSpaces: []
		};

		// Loop through the game board to set up the basic occupied/unoccupied spaces
		for (let i = 0; i < match.board[0].length; i++) {
			for (let j = 0; j < match.board[i].length; j++) {
				let boardLocation = match.board[i][j];
				let oneIndexedLocation = `${i+1},${j+1}`;
				if (!boardLocation.card) {
					parsedGameBoard.openSpaces.push(oneIndexedLocation);
				} else {
					if (boardLocation.color === match.players[myIndex].color) {
						parsedGameBoard.ownedSpaces.push(oneIndexedLocation);
					} else {
						parsedGameBoard.opponentOwnedSpaces.push(oneIndexedLocation);
					}
				}
			}
		}

		// TODO: Optimize the duplicate code

		// Add anything next to opponent's spaces that is part of openSpaces to attackableSpaces, repeat spaces are fine, and used as data for the following block
		for (let i = 0; i < parsedGameBoard.opponentOwnedSpaces.length; i++) {
			let attackLocationList = this.findLocationsToAttackFrom(parsedGameBoard.openSpaces, parsedGameBoard.opponentOwnedSpaces[i]);
			parsedGameBoard.attackableSpaces = parsedGameBoard.attackableSpaces.concat(attackLocationList);
		}

		// Add any duplicate entries from attackableSpaces to highValueAttackSpaces
		parsedGameBoard.highValueAttackSpaces = parsedGameBoard.attackableSpaces.reduce(function(accumulator, currentSpace, currentIndex) {
			if (parsedGameBoard.attackableSpaces.indexOf(currentSpace) !== currentIndex && accumulator.indexOf(currentSpace) < 0) {
				accumulator.push(currentSpace);
			}
			return accumulator;
		}, []);

		// Add anything next to player's spaces that is part of openSpaces to defendableSpaces, repeat spaces are fine, and used as data for the following block
		for (let i = 0; i < parsedGameBoard.ownedSpaces.length; i++) {
			let attackLocationList = this.findLocationsToAttackFrom(parsedGameBoard.openSpaces, parsedGameBoard.ownedSpaces[i]);
			parsedGameBoard.defendableSpaces = parsedGameBoard.defendableSpaces.concat(attackLocationList);
		}

		// Add any duplicate entries from attackableSpaces to highValueDefenseSpaces
		parsedGameBoard.highValueDefenseSpaces = parsedGameBoard.defendableSpaces.reduce(function(accumulator, currentSpace, currentIndex) {
			if (parsedGameBoard.defendableSpaces.indexOf(currentSpace) !== currentIndex && accumulator.indexOf(currentSpace) < 0) {
				accumulator.push(currentSpace);
			}
			return accumulator;
		}, []);

		return parsedGameBoard;
	},

	findLocationsToAttackFrom: function (openSpaces, location) {
		let attackLocations = [];
		let coords = location.split(',');
		coords[0] = parseInt(coords[0]);
		coords[1] = parseInt(coords[1]);
		let spaceToTheNorth = `${coords[0] - 1},${coords[1]}`;
		let spaceToTheEast = `${coords[0]},${coords[1] + 1}`;
		let spaceToTheSouth = `${coords[0] + 1},${coords[1]}`;
		let spaceToTheWest = `${coords[0]},${coords[1] - 1}`;

		// TODO: Refactor this to remove duplicate code

		// Check to the north
		if (openSpaces.includes(spaceToTheNorth)) {
			attackLocations.push(spaceToTheNorth);
		}
		// Check to the east
		if (openSpaces.includes(spaceToTheEast)) {
			attackLocations.push(spaceToTheEast);
		}
		// Check to the south
		if (openSpaces.includes(spaceToTheSouth)) {
			attackLocations.push(spaceToTheSouth);
		}
		// Check to the west
		if (openSpaces.includes(spaceToTheWest)) {
			attackLocations.push(spaceToTheWest);
		}

		return attackLocations;
	},

	// Return the card in my hand that has the highest/lowest index
	determineMinMaxCard: function (match, myIndex, type) {
		let cards = match.players[myIndex].cards;
		let initialAccumulatorIndex;

		for (let i = 0; i < cards.length; i++) {
			if (cards[i]) {
				initialAccumulatorIndex = i;
				break;
			}
		};

		let minMaxCardIndex = cards.reduce((accumulator, currentCard, currentIndex) => {
			let accumulatorCard = cards[accumulator];
			if (currentCard && accumulatorCard) {
				let operation = (type === 'worst') ?
					eval(parseInt(currentCard.id) < parseInt(accumulatorCard.id)) :
					eval(parseInt(currentCard.id) > parseInt(accumulatorCard.id));
				if (operation) {
					accumulator = currentIndex;
				}
			}
			return accumulator;
		}, initialAccumulatorIndex);

		// this.log(`worst card determined to be: id=${minMaxCardIndex} (${cards[minMaxCardIndex].name})`, match, myIndex);
		return minMaxCardIndex;
	},

	// Return if the board is empty (and we obviously shouldn't run extra logic to determine where to play)
	isBoardEmpty: function (match) {
		// Loop through board see if there have been cards played
		let boardIsOccupied = match.board.some((row) => {return row.some((space) => {
			return (space.card)
		});});

		// this.log(`board is ${(boardIsOccupied) ? 'not ': ''}empty`, match, myIndex);
		return !boardIsOccupied;
	},

	// The probable highest attack value for each given rank
	// (tiers 2 and 5 will have some surprises, due to exceptions)
	cardValueMatrix: [
		6,
		6,
		7,
		7,
		7,
		8,
		8,
		9,
		10,
		10
	]

	// accepts either a coordinate string or a two-item coordinate array as the second parameter
	// isBoardSpaceEmpty: function (match, coords) {
	// 	if (typeof coords === 'string') {
	// 		coords = coords.split(',');
	// 		coords[0]--;
	// 		coords[1]--;
	// 	}
	// 	return match.board[coords[0]][coords[1]].card;
	// },

	// iAmWinning: function (match, myIndex) {
		// Needs to be more like 'roundScoreMargin', so that we can choose a strategy based on a value
	// },

	// determineOpponentsRemainingTiers: function (match, myIndex) {
	// },

	// determineOpponentsProbableHighestAttackValue: function (match, myIndex) {
	// },

	// determineOddsThatOpponentCanBeatCard: function (match, myIndex) {
	// },

	// determineBestDefensivePlay: function (match, myIndex) {
	// },

	// determineBestOffensivePlay: function (match, myIndex) {
		// Highest power card that I can take over and likely keep
	// }
};



// Round Scoring & Management functions that need to be accessible and have a preview mode (to keep from eventing out to players, etc.)

// function calculateResult (match, coords, replay) {
// }

// function attack (match, coords, attackingDirection, replay) {
// }

// function playCard (socket, cardIndex, location, replay) {
// }

module.exports = ai;
