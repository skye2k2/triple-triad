// This file handles all AI-related game functions
// NOTE: Yes, we could have a significantly more intelligent AI if we tracked state across turns, but this would dramatically increase server load and overhead. Basic AI parses the event log to determine who played what cards in previous rounds, and thus, either the opponent's remaining cards or card tiers. This is a non-cheating algorithm.

/**
 * "BASIC" AI LOGIC:
 * If I am playing the first card of the round, just play my lowest card defensively along its weak edge
 * Find all open board locations
 * Check high-impact attack locations (where the location borders more than one opponent-owned card)
 * Check for high-impact defensive locations (where the location borders more than one owned card)
 * Check attackable single cards
 * Check for single card defensible locations
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
		logString = ` - ${match.players[myIndex].color} AI${(match.difficulty) ? ' (' + match.difficulty + ')' : ''}: ${logString}`;

		// if (match) {
		// 	match.log.push(logString);
		// }
		if (debugMode) {
			console.log(logString);
		}
	},

	// Primary logic tree
	play: function (match, myIndex) {
		if (typeof myIndex === 'object') {
			myIndex = match.players.indexOf(myIndex);
		}
		let EASY_MODE = (match.difficulty !== 'HARD') ? true : false;

		let bestCardIndex = this.determineMinMaxCard(match, myIndex, 'best');
		let worstCardIndex = this.determineMinMaxCard(match, myIndex, 'worst');
		let attackMove;

		// If I am playing the first card of the round, just play my lowest card, protecting its weak side
		let occupiedBoardSpaces = this.countOccupiedBoardSpaces(match);
		if (occupiedBoardSpaces === 0) {
			let worstCard = match.players[myIndex].cards[worstCardIndex];
			let location;

			if (EASY_MODE) {
				this.log(`board is empty--playing lowest card in the middle`, match, myIndex);
				return this.formatPlay(match, myIndex, worstCardIndex, '2,2');
			}

			let worstCardWeaknessDetail = this.determineWeakSide(worstCard);

			switch (worstCardWeaknessDetail.direction) {
				case 'northwest':
					location = '1,1';
					break;
				case 'north':
					location = '1,2';
					break;
				case 'northeast':
					location = '1,3';
					break;
				case 'east':
					location = '2,3';
					break;
				case 'southeast':
					location = '3,3';
					break;
				case 'south':
					location = '3,2';
					break;
				case 'southwest':
					location = '3,1';
					break;
				case 'west':
					location = '2,1';
					break;
				default:
					location = '2,2';
					break;
			}
			this.log(`board is empty--playing lowest card defensively along its weak edge`, match, myIndex);
			return this.formatPlay(match, myIndex, worstCardIndex, location);
		} else if (occupiedBoardSpaces >= 7) {
			// If there are two or fewer board spaces left, preselect my best remaining card for default plays
			worstCardIndex = bestCardIndex;
		}

		let boardAnalysis = this.parseGameBoard(match, myIndex);
		// We parse each set of priority targets individually, to save effort
		let priorityTargets;

		// console.log(boardAnalysis);

		// If there is overlap between high-value attack and high-value defense spaces, play my best card
		if (!EASY_MODE && boardAnalysis.highValueAttackSpaces.length && boardAnalysis.highValueDefenseSpaces.length) {
			priorityTargets = this.determineOverlap(boardAnalysis.highValueAttackSpaces, boardAnalysis.highValueDefenseSpaces);
			if (priorityTargets) {
				attackMove = this.determineAttackMove(match, myIndex, priorityTargets, boardAnalysis);
				this.log(`playing in an ultra high-value attackable/defendable space`, match, myIndex);
				if (attackMove) {
					return this.formatPlay(match, myIndex, attackMove.cardIndex, attackMove.location);
				} else {
					return this.formatPlay(match, myIndex, worstCardIndex, priorityTargets[0]);
				}
			}
		}

		// Check high-value attackable spaces
		if (!EASY_MODE && boardAnalysis.highValueAttackSpaces.length) {
			priorityTargets = this.determineOverlap(boardAnalysis.highValueAttackSpaces, boardAnalysis.defendableSpaces);
			attackMove;

			if (priorityTargets) {
				attackMove = this.determineAttackMove(match, myIndex, priorityTargets, boardAnalysis);
				if (attackMove) {
					this.log(`playing in a doubly high-value attackable/defendable space`, match, myIndex);
					return this.formatPlay(match, myIndex, attackMove.cardIndex, attackMove.location);
				}
			} else {
				attackMove = this.determineAttackMove(match, myIndex, boardAnalysis.highValueAttackSpaces, boardAnalysis);
				if (attackMove) {
					this.log(`playing in a high-value attackable space`, match, myIndex);
					return this.formatPlay(match, myIndex, attackMove.cardIndex, attackMove.location);
				}
			}
		}

		// If there are no high-value attackable spaces, play in a high-value defensible position to keep cards I own
		if (!EASY_MODE && boardAnalysis.highValueDefenseSpaces.length) {
			priorityTargets = this.determineOverlap(boardAnalysis.highValueDefenseSpaces, boardAnalysis.attackableSpaces);
			if (priorityTargets) {
				this.log(`playing lowest card in a doubly high-value defendable/attackable space`, match, myIndex);
				return this.formatPlay(match, myIndex, worstCardIndex, priorityTargets[0]);
			} else {
				this.log(`playing lowest card in a high-value defendable space`, match, myIndex);
				return this.formatPlay(match, myIndex, worstCardIndex, this.pickRandomItem(boardAnalysis.highValueDefenseSpaces));
			}
		}

		// Check standard attackable spaces
		if (boardAnalysis.attackableSpaces.length) {
			attackMove = this.determineAttackMove(match, myIndex, boardAnalysis.attackableSpaces, boardAnalysis, EASY_MODE);
			if (attackMove) {
				this.log(`playing in an attackable space`, match, myIndex);
				return this.formatPlay(match, myIndex, attackMove.cardIndex, attackMove.location);
			}
		}

		// If there are no attackable spaces, play in a defensible position to keep cards I own
		if (boardAnalysis.defendableSpaces.length) {
			let mostVulnerableLocationDetail = this.determineMostVulnerableLocation(match, boardAnalysis);

			if (mostVulnerableLocationDetail.value < 7) {
				this.log(`tried to cover most vulnerable space, but defending value was too high`, match, myIndex);
			}

			// TODO/BUG: Make sure the new lowestExposedSide is not * just as low or lower* than the current one OR that the currently exposed sides are not just fine by themselves
			if (mostVulnerableLocationDetail && mostVulnerableLocationDetail.value < 7) {
				this.log(`playing card to cover most vulnerable space`, match, myIndex);
				return this.formatPlay(match, myIndex, worstCardIndex, mostVulnerableLocationDetail.location);
			}
		}

		// If there are no appealing attack/defense options, just play my lowest card in an available space
		// TODO: Play defensively along the card's weak edge, similar to the above, but taking available spaces into account
		// TODO: OR play a high-defense card in its power corner
		if (boardAnalysis.openSpaces.length) {
			if (boardAnalysis.openSpaces.length === 1) {
				this.log(`no good options--playing card in last open space`, match, myIndex);
				return this.formatPlay(match, myIndex, worstCardIndex, this.pickRandomItem(boardAnalysis.openSpaces));
			} else {
				this.log(`no good options--playing card in a random open space`, match, myIndex);
				return this.formatPlay(match, myIndex, worstCardIndex, this.pickRandomItem(boardAnalysis.openSpaces));
			}
		} else {
			this.log(`ERROR: no open spaces`, match, myIndex);
		}
	},

	determineAttackMove: function (match, myIndex, attackableSpaces, boardAnalysis, EASY_MODE) {
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
					let exposedSides = this.determineExposedSides(boardAnalysis, space);

					let playDetail = {location: space, cardId: parseInt(card.id), cardIndex: j, captures: captures, exposedSides: exposedSides};

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

		// Choose the lowest-ranked option that gets the job done

		let bestOptionList;

		if (options.extremeValue.length) {
			bestOptionList = options.extremeValue;
		} else if (options.highValue.length) {
			bestOptionList = options.highValue;
		} else if (options.successful.length) {
			bestOptionList = options.successful;
		} else {
			// this.log(`no successful attack moves possible`, match, myIndex);
			return false;
		}

		// Pick a random option for EASY_MODE, increasing the likelihood of a sub-optimal choice
		if (EASY_MODE) {
			return bestOptionList[(Math.floor(Math.random() * bestOptionList.length))]
		}

		// let intelligence = this.parseInformationFromLog(match, myIndex);

		// TODO: Check if the exposed power is above what the opponent could reasonably capture
		// console.log(`-----------`);
		// if (intelligence.opponentHand) {
		// 	console.log(intelligence.opponentHand);
		// } else {
		// 	console.log(opponentAvailableCardTiers);
		// 	console.log(opponentHighestCardValue);
		// }
		// console.log(`-----------`);

		let cheapestOption = bestOptionList.reduce((accumulator, currentOption) => {
			if (!accumulator) {
				accumulator = currentOption;
			} else {
				currentOptionLowestExposedSide = this.determineWeakSide(match.players[myIndex].cards[currentOption.cardIndex], currentOption.exposedSides);
				accumulatorLowestExposedSide = this.determineWeakSide(match.players[myIndex].cards[accumulator.cardIndex], accumulator.exposedSides);

				// TODO: Compare the highest rank of captured cards, to know which captures are better than others

				// Use the lowest-ranked card, unless it would expose a significantly lower power
				if (currentOption.cardId < accumulator.cardId ||
					// currentOption.tier - accumulator.tier < 4
					// currentOptionLowestExposedSide.power > opponentInformation.probableHighestCardValue
					currentOptionLowestExposedSide.power > accumulatorLowestExposedSide.power + 2
				) {
					accumulator = currentOption;
				}
			}
			return accumulator;
		});

		return cheapestOption;
	},

	// Given a card location, determine which sides are exposed to attack
	determineExposedSides: function (boardAnalysis, location) {
		attackLocations = this.findLocationsToAttackFrom(boardAnalysis.openSpaces, location);
		if (attackLocations.length) {
			let exposedDirections = [];
			let coords = location.split(',');
			coords[0] = parseInt(coords[0]);
			coords[1] = parseInt(coords[1]);
			coords[0]--;
			coords[1]--;

			// for each result, interpret attacking locations into directions
			for (let i = 0; i < attackLocations.length; i++) {
				const attackCoords = this.locationToCoords(attackLocations[i]);

				let attackDirection;

				if (attackCoords[0] < coords[0]) {
					attackDirection = 'north';
				} else if (attackCoords[0] > coords[0]) {
					attackDirection = 'south';
				} else if (attackCoords[1] > coords[1]) {
					attackDirection = 'east';
				} else if (attackCoords[1] < coords[1]) {
					attackDirection = 'west';
				}

				exposedDirections.push(attackDirection);
			}
			return exposedDirections;
		} else {
			return false;
		}
	},

	// Given my currently-played cards, what is the location where the lowest value is exposed to my opponent?
	determineMostVulnerableLocation: function (match, boardAnalysis) {
		let lowestExposedDetailList = [];

		for (let i = 0; i < boardAnalysis.ownedSpaces.length; i++) {
			let location = boardAnalysis.ownedSpaces[i];
			let coords = this.locationToCoords(location)
			let card = match.board[coords[0]][coords[1]].card;
			let exposedSides = this.determineExposedSides(boardAnalysis, location);
			if (exposedSides) {
				let lowestExposedSide = this.determineWeakSide(card, exposedSides);
				lowestExposedDetailList.push({location: location, exposedSides: exposedSides, ...lowestExposedSide});
			}
		}

		let lowestExposedCardDetail = lowestExposedDetailList.reduce((accumulator, currentOption) => {
			if (!accumulator) {
				accumulator = currentOption;
			} else {
				if (currentOption.power < accumulator.power) {
					accumulator = currentOption;
				}
			}
			return accumulator;
		});


		let coords = lowestExposedCardDetail.location.split(',');
		coords[0] = parseInt(coords[0]);
		coords[1] = parseInt(coords[1]);
		switch (lowestExposedCardDetail.direction) {
			case 'north':
				coords[0]--;
				break;
			case 'east':
				coords[1]++;
				break;
			case 'south':
				coords[0]++;
				break;
			case 'west':
				coords[1]--;
				break;
			default:
				break;
		}


		return {location: `{${coords[0]},${coords[1]}`, value: lowestExposedCardDetail[lowestExposedCardDetail.direction]};
	},

	// Given a particular card, determine its most vulnerable side (or corner, if not passed sidesToCheck)
	determineWeakSide: function (card, sidesToCheck) {
		let sides = [];

		if (sidesToCheck) {
			for (let i = 0; i < sidesToCheck.length; i++) {
				sides.push({direction: sidesToCheck[i], power: card[sidesToCheck[i]]});
			}
		} else {
			sides = [
				{direction: 'north', power: card.north},
				{direction: 'east', power: card.east},
				{direction: 'south', power: card.south},
				{direction: 'west', power: card.west}
			];
		}

		// Determine the card's weakest side
		let weakestSide = sides.reduce((accumulator, currentOption) => {
			if (!accumulator || currentOption.power < accumulator.power) {
				accumulator = currentOption;
			}
			return accumulator;
		});

		// Determine any other relatively weak sides
		const sideStrengthDeviation = 2;
		let weakestSides = [weakestSide];
		for (let i = 0; i < sides.length; i++) {
			if (sides[i] !== weakestSide && sides[i].power < weakestSide.power + sideStrengthDeviation) {
				weakestSides.push(sides[i]);
			}
		}

		// If the card only has two adjacent weak sides, play in a corner to cover both
		if (!sidesToCheck && weakestSides.length === 2) {
			let sideText = '';
			for (let i = 0; i < weakestSides.length; i++) {
				if (weakestSides[i].direction === 'north' || weakestSides[i].direction === 'south') {
					sideText = weakestSides[i].direction + sideText;
				} else if (weakestSides[i].direction === 'east' || weakestSides[i].direction === 'west') {
					sideText += weakestSides[i].direction;
				}
			}
			// Obviously, we can't cover both opposite sides
			switch (sideText) {
				case 'northwest':
				case 'northeast':
				case 'southwest':
				case 'southeast':
					return {direction: sideText};
					break;
				default:
					return weakestSide;
					break;
			}
		} else {
			// If the card has one or three weak sides, only cover one of them
			// OR if we passed in sidesToCheck
			return weakestSide;
		}
	},

	// Check intersection of two sets
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

	// Parse game board to index all open board locations, occupied locations, and attackable/defendable locations
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

	// Based on the currently available open spaces on the board and a given opponent card location, determine where the card can be attacked from
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

		// this.log(`lowest card determined to be: id=${minMaxCardIndex} (${cards[minMaxCardIndex].name})`, match, myIndex);
		return minMaxCardIndex;
	},

	// Return the count of occupied board spaces, to determine if the board is empty (and we obviously shouldn't run extra logic to determine where to play)
	countOccupiedBoardSpaces: function (match) {
		occupiedBoardSpaces = 0;
		// Loop through board and count the occupied spaces
		match.board.map((row) => {return row.map((space) => {
			if (space.card) {
				occupiedBoardSpaces++;
			}
		});});

		return occupiedBoardSpaces;
	},

	// Convert a comma-separated location string into its corresponding coordinates array location
	locationToCoords: function (location) {
		if (typeof location === 'string') {
			coords = location.split(',');
			coords[0]--;
			coords[1]--;
		}
		return coords;
	},

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
	parseInformationFromLog: function (match, myIndex) {
		opponentIndex = (match.players.indexOf(myIndex) === 0) ? 1 : 0;
		opponentColor = match.players[opponentIndex].color;
		let opponentAvailableCardTiers = (match.roundNumber < 3) ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [6, 7, 8, 9, 10];

		// Once a tiebreaker happens, we can't count based on tiers--but we can determine at least four of the opponent's cards
		let currentTiebreakerRoundLogIndex = match.log.lastIndexOf(`Begin Round ${match.roundNumber} Tiebreaker`);

		if (currentTiebreakerRoundLogIndex === -1) {
			// Determine the card tiers played from the first round, by using roundNumber - 1
			if (match.roundNumber === 2) {
				opponentAvailableCardTiers = this.parsePlaysForRound(match.log, match.roundNumber - 1, opponentAvailableCardTiers, opponentColor).opponentAvailableTiers;
			}

			opponentAvailableCardTiers = this.parsePlaysForRound(match.log, match.roundNumber, opponentAvailableCardTiers, opponentColor).opponentAvailableTiers;

			return {
				opponentAvailableCardTiers: opponentAvailableCardTiers,
				opponentHighestCardValue: this.cardHighestValueMatrix[opponentAvailableCardTiers[opponentAvailableCardTiers.length - 1] - 1]
			};
		} else {
			// Parse the played cards from the current round
			currentRoundDetail = this.parsePlaysForRound(match.log, match.roundNumber, opponentAvailableCardTiers, 'any', currentTiebreakerRoundLogIndex);

			// Parse the played cards from the round before tiebreaker
			pastRoundDetail = this.parsePlaysForRound(match.log, match.roundNumber, opponentAvailableCardTiers, 'any');

			// Remove the cards that we own
			let knownCards = pastRoundDetail.availableCards.filter((card) => {
				return !match.players[myIndex].cards.includes(card);
			});

			// Remove the cards that both players have played thus far this round
			knownCards = knownCards.filter((card) => {
				return !currentRoundDetail.playedCardIds.includes(card.id.toString());
			});

			return {
				// opponentAvailableCardTiers/opponentHighestCardValue, // We are not including this information, at this point, because the actual cards are much more precise than tier-based probabilities
				opponentHand: knownCards
			};
		}
	},

	// Given a specific round, determine the card tiers remaining for an opponent, or, if a tiebreaker round, also return the entire previously-played set of cards.
	parsePlaysForRound: function (log, roundNumber, availableTiers, opponentColor, entryToStartFrom) {
		entryToStartFrom = entryToStartFrom || log.indexOf(`Begin Round ${roundNumber}`);
		let availableCardList = [];
		let playedCardIds = [];
		for (let i = entryToStartFrom + 1; i < log.length; i++) {
			if (log[i].includes(`:play`)) {
				logBits = log[i].split(':');

				// Calculate the tier of the played card, base on the id
				let cardId = parseInt(logBits[4]);
				let cardTierNumber = Math.ceil(cardId / 11);

				playedCardIds.push(logBits[4]);

				if (opponentColor !== 'any' && log[i].includes(opponentColor)) {
					// Remove the tier of the played card from the list of potential cards the opponent has remaining
					availableTiers = availableTiers.filter((val) => {
						return val !== cardTierNumber
					});
				} else {
					// Add the information of all played cards to the known list for the round
					availableCardList.push(this.gameplay.cardList[`tier${cardTierNumber}`][(cardId - 1) % 11]);
				}
			} else if (log[i].includes(`Begin Round ${roundNumber} Tiebreaker`) || log[i].includes(`End Round ${roundNumber}`)) {
				break;
			}
		};

		return { opponentAvailableTiers: availableTiers, availableCards: availableCardList, playedCardIds: playedCardIds};
	}
};

module.exports = ai;
