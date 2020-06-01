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

let gameplay = require("./gameplay");

let debugMode = true;

let ai = {

	gameplay: gameplay,

	// Since we always need to indicate the match, card, socket, and location, provide a standardized function for it
	formatPlay: function (match, myIndex, cardIndex, location) {
		return {
			match, match,
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

		// TODO: If it is my last turn, and I did not start the round, play the better of my two remaining cards

		let boardAnalysis = this.parseGameBoard(match, myIndex);
		// We parse each set of priority targets individually, so save effort
		let priorityTargets;

		// console.log(boardAnalysis);

		// If there is overlap between high-value attack and high-value defense spaces, play my best card
		if (boardAnalysis.highValueAttackSpaces.length && boardAnalysis.highValueDefenseSpaces.length) {
			priorityTargets = this.determineOverlap(boardAnalysis.highValueAttackSpaces, boardAnalysis.highValueDefenseSpaces);
			if (priorityTargets) {
				let attackMove = this.determineAttackMove(match, myIndex, priorityTargets);
				this.log(`playing in an ultra high-value attackable/defendable space`, match, myIndex);
				if (attackMove) {
					return this.formatPlay(match, myIndex, attackMove.cardIndex, attackMove.location);
				} else {
					return this.formatPlay(match, myIndex, worstCardIndex, priorityTargets[0]);
				}
			}
		}

		// Check high-value attackable spaces
		if (boardAnalysis.highValueAttackSpaces.length) {
			priorityTargets = this.determineOverlap(boardAnalysis.highValueAttackSpaces, boardAnalysis.defendableSpaces);
			let attackMove;

			if (priorityTargets) {
				attackMove = this.determineAttackMove(match, myIndex, priorityTargets);
				if (attackMove) {
					this.log(`playing in a doubly high-value attackable/defendable space`, match, myIndex);
					return this.formatPlay(match, myIndex, attackMove.cardIndex, attackMove.location);
				}
			} else {
				attackMove = this.determineAttackMove(match, myIndex, boardAnalysis.highValueAttackSpaces);
				if (attackMove) {
					this.log(`playing in a high-value attackable space`, match, myIndex);
					return this.formatPlay(match, myIndex, attackMove.cardIndex, attackMove.location);
				}
			}
		}

		// If there are no high-value attackable spaces, play in a high-value defensible position to keep cards I own
		if (boardAnalysis.highValueDefenseSpaces.length) {
			priorityTargets = this.determineOverlap(boardAnalysis.highValueDefenseSpaces, boardAnalysis.attackableSpaces);
			if (priorityTargets) {
				this.log(`playing worst card in a doubly high-value defendable/attackable space`, match, myIndex);
				return this.formatPlay(match, myIndex, worstCardIndex, priorityTargets[0]);
			} else {
				this.log(`playing worst card in a high-value defendable space`, match, myIndex);
				return this.formatPlay(match, myIndex, worstCardIndex, this.pickRandomItem(boardAnalysis.highValueDefenseSpaces));
			}
		}

		// Check standard attackable spaces
		if (boardAnalysis.attackableSpaces.length) {
			let attackMove = this.determineAttackMove(match, myIndex, boardAnalysis.attackableSpaces);
			if (attackMove) {
				this.log(`playing worst card in an attackable space`, match, myIndex);
				return this.formatPlay(match, myIndex, attackMove.cardIndex, attackMove.location);
			}
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

	determineAttackMove: function (match, myIndex, attackableSpaces) {
		let options = {
			extremeValue: [],
			highValue: [],
			successful: [],
			unsuccessful: []
		};

		// Try each card in hand, to see which plays result in a successful attack
		for (let i = 0; i < attackableSpaces.length; i++) {
			let space = attackableSpaces[i];
			for (let j = 0; j < match.players[myIndex].cards.length; j++) {
				let card = match.players[myIndex].cards[j];
				// Check for card, since we use empty placeholders
				if (card) {
					let captures = this.gameplay.playCard(match, match.players[myIndex].socket, j, space, 'preview');
					// TODO: Track the highest rank of captured card, to know which captures are better than others
					let playDetail = {location: space, cardId: parseInt(card.id), cardIndex: j, captures: captures};
					if (captures.length > 2) {
						options.extremeValue.push(playDetail);
					} else if (captures.length > 1) {
						options.highValue.push(playDetail);
					} else if (captures.length > 0) {
						options.successful.push(playDetail);
					} else {
						options.unsuccessful.push(playDetail);
					}
				}
			}
		}

		// console.log(options);

		// Choose the lowest-ranked option (future: that is reasonably safe)

		let bestOptionList;

		if (options.extremeValue.length) {
			bestOptionList = options.extremeValue;
		} else if (options.highValue.length) {
			bestOptionList = options.highValue;
		} else if (options.successful.length) {
			bestOptionList = options.successful;
		} else {
			this.log(`no successful attack moves possible`, match, myIndex);
			return false;
		}

		let opponentInformation = this.parseOpponentInformationFromLog(match, myIndex);

		let cheapestOption = bestOptionList.reduce((accumulator, currentOption) => {
			if (!accumulator || currentOption.cardId < accumulator.cardId) {
				accumulator = currentOption;
			}
			return accumulator;
		});

		return cheapestOption;
	},

	determineOverlap: function (arrayToFilter, arrayToFind) {
		let arrayOverlap = arrayToFilter.filter((value) => { arrayToFind.includes(value); });
		if (arrayOverlap.length) {
			return arrayOverlap
		} else {
			return false;
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

	// determineOddsThatOpponentCanBeatCard: function (match, myIndex) {
	// },

	// determineBestDefensivePlay: function (match, myIndex) {
	// },

	// determineBestOffensivePlay: function (match, myIndex) {
		// Highest power card that I can take over and likely keep
	// }

	// The probable highest attack value for each given rank
	// (tiers 2 and 5 will have some surprises, due to exceptions)
	cardHighestValueMatrix: [
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
	],

	// Keep track of the cards the opponent has played (non-omniscient card-counting)
	parseOpponentInformationFromLog: function (match, myIndex) {
		opponentIndex = (match.players.indexOf(myIndex) === 0) ? 1 : 0;
		opponentColor = match.players[opponentIndex].color;
		let opponentAvailableCardTiers = (match.roundNumber < 3) ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [6, 7, 8, 9, 10];

		// TODO: Once a tiebreaker happens, all bets are off. Figure out a way around this
		let currentTiebreakerRoundLogIndex = match.log.lastIndexOf(`Begin Round ${match.roundNumber} Tiebreaker`);

		if (currentTiebreakerRoundLogIndex === -1) {
			// Determine the first set of plays from the first round, by using roundNumber - 1
			if (match.roundNumber === 2) {
				opponentAvailableCardTiers = this.parseOpponentPlaysForRound(match.log, match.roundNumber - 1, opponentAvailableCardTiers, opponentColor);
			}

			opponentAvailableCardTiers = this.parseOpponentPlaysForRound(match.log, match.roundNumber, opponentAvailableCardTiers, opponentColor);

			return {
				availableCardTiers: opponentAvailableCardTiers,
				probableHighestCardValue: this.cardHighestValueMatrix[opponentAvailableCardTiers[opponentAvailableCardTiers.length - 1] - 1]
			};
		} else {
			return false;
		}
	},

	// Given a specific round, determine the card tiers that have been played by an opponent.
	parseOpponentPlaysForRound: function (log, roundNumber, availableTiers, opponentColor) {
		let entryToStartFrom = log.indexOf(`Begin Round ${roundNumber}`);
		for (let i = entryToStartFrom; i < log.length; i++) {
			if (log[i].includes(`${opponentColor}:play`)) {
				logBits = log[i].split(':');
				// Calculate the tier of the played card
				let tierNumber = Math.ceil(parseInt(logBits[4]) / 11);
				// Remove the tier of the played card from the list of potential cards the opponent has remaining
				availableTiers = availableTiers.filter((val) => {
					return val !== tierNumber
				});
			} else if (log[i].includes(`Begin Round ${roundNumber} Tiebreaker`) || log[i].includes(`End Round ${roundNumber}`)) {
				break;
			}
		};

		return availableTiers;
	}
};

module.exports = ai;
