// This file handles all play-related server-side game logic and functions
// TODO: Figure out how exactly we have access to the io functions, here

let cards = require("./cards");

let debugMode = true;

// | Board |_0_|_1_|_2_|
// |   0   |   |   |   |
// |   1   |   |   |   |
// |   2   |   |   |   |

let emptySpace = {color: null, card: null};

let emptyBoard = [
	[emptySpace, emptySpace, emptySpace],
	[emptySpace, emptySpace, emptySpace],
	[emptySpace, emptySpace, emptySpace],
];

let gameplay = {
	// The game manager needs access to the card list to generate matched decks, and the AI obviously needs access to the card stats to do analysis, so we load it here as the single source of truth
	cardList: cards,

	// Prefix and log messages, as necessary
	log: function (logString, match) {
		if (match) {
			match.log.push(logString);
		}
		if (debugMode) {
			console.log(logString);
		}
	},

	// Card Management

	/**
	 * @description - Deal a player a hand from the cards in their deck.
	 * @returns {undefined} - Modifies match data directly.
	 */
	dealHand: function (playerObject) {
		playerObject.cards = [];
		for (var i = 0; i < 5; i++) {
			playerObject.cards[i] = this.drawCard(playerObject.deck);
		}
		// TODO: RE-SORT HAND BY TIER TO HELP PLAYERS OUT. BUT THEN OPPONENT CARDS JUST NEED TO BE PLAYED FROM THE TOP DOWN, OTHERWISE THE OPPONENT WILL KNOW THE RELATIVE STRENGTH OF THEIR OPPONENT'S REMAINING HAND
	},

	/**
	 * @description - Pull the top card from the given deck.
	 * @returns {Object} - The card drawn from the player's deck.
	 */
	drawCard: function (deck) {
		return deck.shift();
	},

	/**
	 * @description - Create a shuffled deck for a player from all available cards, based on the provided distribution, or one from each tier, if no distribution is provided.
	 * @returns {Array} - An array of available cards to the player.
	 */
	generateDeck: function (distribution) {
		let deck = [];
		// Create a randomized, but balanced deck of 10 cards (enough for two rounds, with a heavy-hitter tiebreaker hand drawn, if needed).
		let balancedDeckDistribution = {
			tier1: 1,
			tier2: 1,
			tier3: 1,
			tier4: 1,
			tier5: 1,
			tier6: 1,
			tier7: 1,
			tier8: 1,
			tier9: 1,
			tier10: 1,
		};

		for (let [tier, count] of Object.entries(distribution || balancedDeckDistribution)) {
			for (var i = 0; i < count; i++) {
				var randomCardIndex = Math.floor(Math.random() * (this.cardList[tier].length));
				// console.log(tier, randomCardIndex, (cards[tier][randomCardIndex]) ? cards[tier][randomCardIndex].name : 'ERROR');
				// TODO: Generate random card IDs to discourage cheating
				// TODO: Try to avoid duplicates between players
				deck.push(this.cardList[tier][randomCardIndex]);
			}
		}

		this.shuffleDeck(deck);
		return deck;
	},

	/**
	 * @description - Quickly re-order cards using an efficient pseudo-random method.
	 * @returns {undefined} - Modifies deck parameter in-place.
	 */
	shuffleDeck: function (deck) {
		// Durstenfeld Shuffle (modified Fisher-Yates, which modifies in-place): https://stackoverflow.com/a/12646864/5334305 https://bost.ocks.org/mike/shuffle/
		for (let i = deck.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[deck[i], deck[j]] = [deck[j], deck[i]];
		}
	},

	/**
	 * @description - Play a card as a computer.
	 */
	playAICard: function (playDetail) {
		// console.log(`AI PLAY: ${playDetail.cardIndex} ${playDetail.location}`);
		// TODO: CONSIDER RETURNING playCard() TO HELP WITH TIMING
		this.playCard(playDetail.match, playDetail.socket, playDetail.cardIndex, playDetail.location, 'bot');
	},

	/**
	 * @description - Play the card at the specified hand index to the specified location.
	 * @returns {undefined} - Modifies match data directly and calls out, if needed.
	 */
	playCard: function (match, socket, cardIndex, location, playMode) {
		// console.log('playCard attempt: ', socket.id, `\n cardIndex: ${cardIndex}\n location: ${location}`);
		if (match) {
			let player = match.players[match.players[0].socket.id === socket.id ? 0 : 1];
			let coords = location.split(',');
			// Shift to handle 0-indexed array on server vs 1-indexed locations on client
			coords[0]--;
			coords[1]--;
			let boardLocation = match.board[coords[0]][coords[1]];
			if (!boardLocation.card && player.activePlayer) {
				if (cardIndex >= 0 && cardIndex <= 4) {
					if (player.cards[cardIndex] !== null) {
						let card = player.cards[cardIndex];
						// TODO: Should be able to do a mod of `player`
						let opponent = match.players[match.players[0].socket.id !== socket.id ? 0 : 1];

						boardLocation.card = card;
						boardLocation.color = player.color;

						if (playMode === 'preview') {
							// console.log(`${player.color}:preview:${location}:${cardIndex}:${card.id}:${card.name}`);
							let results = this.calculateResult(match, coords, playMode);
							// Undo preview play
							boardLocation.card = null;
							boardLocation.color = null;

							return results;
						} else {
							this.log(`${player.color}:play:${location}:${cardIndex}:${card.id}:${card.name}`, match);

							opponent.socket.emit("card played", {cardIndexInHand: cardIndex, location: location, color: opponent.color, cardImageId: card.id});
							// TODO: Remember WHY these need to be sent
							if (playMode === 'bot') {
								player.socket.emit("card played", {cardIndexInHand: cardIndex, location: location, color: player.color, cardImageId: card.id, mine: true});
							}
							for (var i = 0; i < match.spectators.length; i++) {
								let spectator = match.spectators[i];
								spectator.socket.emit("card played", {cardIndexInHand: cardIndex, location: location, color: player.color, cardImageId: card.id, spectator: (player.color === 'blue') ? true : false});
							}

							player.cards[cardIndex] = null;

							// Only toggle the active player if a player still has cards. The active player switches at the start of each round, in order to alternate fairly
							for (let i = 0; i < player.cards.length; i++) {
								if (player.cards[i]) {
									// We want calculateResult to happen before toggling the active player, but calculateResult *could* trigger a new round, which would give the players new cards, so, we're using a timeout, because using an intermediary value didn't work...however, this also makes things awkward when attempting to run a pure bot match...
									setTimeout(() => {
										this.toggleActivePlayer(match);
									}, 0);
									break;
								}
							}
							this.calculateResult(match, coords, playMode);
						}

					} else {
						console.warn(`INVALID PLAY: (card already played: ${cardIndex})`);
					}
				}
			} else {
				// The only way this should happen is if a player hacked their CSS to re-enable events on the other player's turn, or the AI tried to cheat
				console.warn(`INVALID MOVE ATTEMPTED (location: ${location} potentially occupied, activePlayer: ${player.activePlayer})`);
				player.socket.emit("undo play", {cardIndexInHand: cardIndex, location: location}); // TODO: IMPLEMENT THIS
			}
		}
	},

	// Calculations

	/**
	 * @description - From the attacking space, determine if any cards need to be flipped.
	 * @returns {undefined} - Modifies match data directly.
	 */
	attack: function (match, coords, attackingDirection, playMode) {
		let board = match.board;
		let attackingLocation = board[coords[0]][coords[1]];
		let defendingLocation;
		let defendingLocationString; // Add back in 1 to deal with offset

		// Determine if there is a card in the direction attacked
		switch (attackingDirection) {
			case 'north':
				defendingLocation = (coords[0] - 1 in board) ? board[coords[0] - 1][coords[1]] : false || false;
				defendingLocationString = `${coords[0]},${coords[1] + 1}`;
				defendingDirection = 'south';
				break;
			case 'east':
				defendingLocation = board[coords[0]][coords[1] + 1] || false;
				defendingLocationString = `${coords[0] + 1},${coords[1] + 2}`;
				defendingDirection = 'west';
				break;
			case 'south':
				defendingLocation = (coords[0] + 1 in board) ? board[coords[0] + 1][coords[1]] : false || false;
				defendingLocationString = `${coords[0] + 2},${coords[1] + 1}`;
				defendingDirection = 'north';
				break;
			case 'west':
				defendingLocation = board[coords[0]][coords[1] - 1] || false;
				defendingLocationString = `${coords[0] + 1},${coords[1]}`;
				defendingDirection = 'east';
				break;
			default:
				break;
		}

		// Determine if defending card belongs to opponent
		if (defendingLocation && defendingLocation.color !== attackingLocation.color) {
			// Only the card played can flip, if its power is greater than the defending card.
			if (match.rules === "BASIC") {
				if (defendingLocation.card && attackingLocation.card[attackingDirection] > defendingLocation.card[defendingDirection]) {
					if (playMode === 'preview') {
						return `${attackingLocation.color}:capture:${defendingLocationString}:${defendingLocation.card.id}:${defendingLocation.card.name} (${attackingDirection})`;
					} else {
						match.roundStrength[attackingLocation.color]++;
						match.roundStrength[defendingLocation.color]--;
						defendingLocation.color = attackingLocation.color;
						this.log(`${attackingLocation.color}:capture:${defendingLocationString}:${defendingLocation.card.id}:${defendingLocation.card.name} (${attackingDirection})`, match);
						io.to(match.matchId).emit("card flipped", {location: defendingLocationString, matchDetail: { roundStrength: match.roundStrength}});
					}
				}
			// TODO: equal values can flip on the initial placement, and then flipped cards can "combo", flipping additional cards if they are more powerful.
			} else if (match.rules === "SAME") {
			}
		}
	},

	/**
	 * @description - After a card is played, determine its effect on the board, and if the board is now full, determine the round winner.
	 * @returns {undefined} - Modifies match data directly.
	 */
	calculateResult: function (match, coords, playMode) {
		let results = [];
		results.push(this.attack(match, coords, 'north', playMode));
		results.push(this.attack(match, coords, 'east', playMode));
		results.push(this.attack(match, coords, 'south', playMode));
		results.push(this.attack(match, coords, 'west', playMode));

		if (playMode === 'preview') {
			// Remove undefined entries, for now
			// TODO: Don't add undefined entries, at all
			results = results.filter(Boolean);
			return results;
		} else {
			let gameSpaces = 0;
			let filledSpaces = 0;
			match.board.map((row) => {row.map((space) => {gameSpaces++; if (space.color) { filledSpaces++; }});});

			if (filledSpaces === gameSpaces) {
				this.processRound(match);
			}
		}
	},

	// Round Management

	endMatch: function (match) {
		// totalMatchesPlayed++;
		// console.log(`END MATCH: ${match.matchId}`);
		io.to(match.matchId).emit("end match", {scoreboard: match.scoreboard, log: match.log, runningScore: match.runningScore});
		match.isOver = true;

		io.updateMatchStatistics();
	},

	/**
	 * @description - After all board slots have been filled, determine round winner, ending match is someone has won 2 out of 3.
	 * @returns {undefined} - Modifies match data directly.
	 */
	processRound: function (match) {
		let redRoundScore = match.roundStrength.red;
		let blueRoundScore = match.roundStrength.blue;

		if (redRoundScore === blueRoundScore) {
			// Immediately play another round, with each player taking the cards they currently own on the board
			this.tiebreaker(match);
			return;
		} else if (redRoundScore > blueRoundScore) {
			this.log(`End Round ${match.roundNumber}`, match);
			this.log(`red win round: (${redRoundScore} - ${blueRoundScore})`, match);
			match.scoreboard.red++;
		} else if (blueRoundScore > redRoundScore) {
			this.log(`End Round ${match.roundNumber}`, match);
			this.log(`blue win round: (${blueRoundScore} - ${redRoundScore})`, match);
			match.scoreboard.blue++;
		}

		let redTotalScore = match.scoreboard.red;
		let blueTotalScore = match.scoreboard.blue;

		io.to(match.matchId).emit("update score", {scoreboard: match.scoreboard, roundStrength: match.roundStrength, runningScore: match.runningScore});

		// Check if game is over, otherwise start the next round
		if (redTotalScore === 2) {
			match.runningScore.red++
			this.log(`red: WIN MATCH (${redTotalScore} - ${blueTotalScore})`);
			this.endMatch(match);
		} else if (blueTotalScore === 2) {
			match.runningScore.blue++
			this.log(`blue: WIN MATCH (${blueTotalScore} - ${redTotalScore})`);
			this.endMatch(match);
		} else {
			this.log(`Total Score: red: ${redTotalScore} blue: ${blueTotalScore}`);
			this.startNewRound(match);
		}
	},

	// Set/Reset the bits needed for each match
	setMatchDefaults: function (match, rematch) {
		match.matchCount++;

		if (rematch) {
			delete match.rematch;
		}

		const defaults = {
			isOver: false,
			log: [],
			roundNumber: 0,
			roundStrength: {
				red: 5,
				blue: 5
			},
			scoreboard: {
				red: 0,
				blue: 0
			},
		}

		Object.assign(match, defaults)
	},

	/**
	 * @description - Reset round-based flags and values, swap starting players, and deal a new hand to each player.
	 * @returns {undefined} - Modifies match data directly, and EMITS hand to player.
	 */
	startNewRound: function (match, tiebreakerRound) {
		io.updateMatchStatistics();
		if (tiebreakerRound) {
			this.log(`Begin Round ${match.roundNumber} Tiebreaker`, match);
		} else {
			match.roundNumber++;
			this.log(`Begin Round ${match.roundNumber}`, match);
		}
		match.board = JSON.parse(JSON.stringify(emptyBoard));
		match.roundStrength = {red: 5, blue: 5}

		for (var i = 0; i < match.players.length; i++) {
			let player = match.players[i];

			// If players are out of cards, generate a high-power hand for the final round
			if (!player.deck.length) {
				let powerDeckDistribution = {
					tier6: 1,
					tier7: 1,
					tier8: 1,
					tier9: 1,
					tier10: 1,
				};

				if (match.roundNumber !== 1) {
					player.deck = this.generateDeck(powerDeckDistribution);
				} else {
					player.deck = this.generateDeck();
				}
			}
			this.dealHand(player);
			player.socket.emit("draw hand", player.cards);
		}

		for (var i = 0; i < match.spectators.length; i++) {
			let spectator = match.spectators[i];
			spectator.socket.emit("draw hand", true);
		}

		this.toggleActivePlayer(match);

		// HARD-CODED TESTING
		// setTimeout(() => {
		// 	let activePlayer = (match.players[0].activePlayer) ? 0 : 1;
		// 	let otherPlayer = (activePlayer === 0) ? 1 : 0;
		// 	// HARD-CODED AI TESTING
		// 	if (match.roundNumber < 4) {
		// 		playAICard(AI.play(match, activePlayer));
		// 		playAICard(AI.play(match, otherPlayer));
		// 		playAICard(AI.play(match, activePlayer));
		// 		playAICard(AI.play(match, otherPlayer));
		// 		playAICard(AI.play(match, activePlayer));
		// 		playAICard(AI.play(match, otherPlayer));
		// 		playAICard(AI.play(match, activePlayer));
		// 		playAICard(AI.play(match, otherPlayer));
		// 		playAICard(AI.play(match, activePlayer));
		// 	}
		// }, 600);
	},

	/**
	 * @description - If a round is going to end in a draw, have each player pick up the cards they currently own to form a new hand, and play until a winner is decided.
	 * @returns {undefined} - Modifies match data directly, and calls out to start another round.
	 */
	tiebreaker: function (match) {
		for (var i = 0; i < match.players.length; i++) {
			let player = match.players[i];
			let playerColor = player.color;

			// Also give the unplayed card back to its owner
			for (var j = 0; j < player.cards.length; j++) {
				if (player.cards[j]) {
					player.deck.unshift(player.cards[j]);
				}
			}

			// Loop through board and give each player the cards they currently own
			match.board.map((row) => {row.map((space) => { if (space.color === playerColor) {
				match.players[i].deck.unshift(space.card);
			}});});
		}
		this.startNewRound(match, true);
	},

	/**
	 * @description - After a card is played, or at the start of a match/round(?), enable/disable player hands, so that only one card can be played at a time, alternating players.
	 * @returns {undefined} - Modifies match data directly, and calls out to players with update.
	 */
	toggleActivePlayer: function (match) {
		for (var i = 0; i < match.players.length; i++) {
			let player = match.players[i];
			player.activePlayer = !player.activePlayer;
			player.socket.emit("enable hand", player.activePlayer);

			if (player.bot && player.activePlayer) {
				this.playAICard(player.socket.AI.play(match, player));
			}
		}
	}
};

module.exports = gameplay;
