# Triple Triad

Based on a game that once existed in our universe. No ads, no cost, no third-party logins. Just games.

Built with Node.js, Socket.io, and FabricJS.

## How to play

[Short Rule Summary](http://www.vyseri.com/images/tripletriad2.png)

## Copyright

The game, its rules, characters, and artwork are all copyrighted by Square Enix. The game was designed by Hiroyuki Ito and released as a mini-game plus side quest in Final Fantasy VIII in 1999. The card images used in this adaptation originate from the Bandai CCG released the same year, unfortunately for many, only in Japan. The music is an adaptation of "Shuffle or Boogie", by [Simple Music](https://soundcloud.com/simple-music-4/final-fantasy-8-triple-triad-remix). The card back design was created by [Karen McCarthy](https://www.artstation.com/artwork/8YZbq) for another fan-made implementation of this game. Slimmed-down how-to-play content taken from [finalfantasy.fandom.com](https://finalfantasy.fandom.com/wiki/Triple_Triad_(Final_Fantasy_VIII)).

## Changelog:

**0.1.0**

**Initial bits**

- Socket.io implementation for game server, allowing multiple simultaneous matches
- Drag'n'drop method of playing cards (placement limited to empty board spaces)
- Opponent cards played move onto board and utilize a flip animation (flipped cards also animate)
- Opponent cards displayed monochrome
- HTTP resource compression & caching for a fast experience, while reducing server-side load
- Board completely drawn by repeating and rotating a single corner art image
- Server-side validation of cards & card placement, to keep things from being too easy for hackers
- Shuffle or Boogie music (remix by: SOURCE), with subtle playing indication (notes bounce in time to the music)

#### TODO List:

- Only active player can play cards
- Perfectly centered game board and title positioning
- Add board background art
- Resize all of the elements in the canvas on page resize (especially for orientation changes on phones)
- Allow users to half-start a game (lobby), then send a code/URL to have their friend join them, jackbox-style
  - Similarly, after the second player has joined, anyone else will just be a spectator (tricky bit)
  - Allow spectators to connect to matches in progress (replay from game log)
  - List matches in progress on home screen
- Allow users to choose names (maybe from a selection of FF VIII characters, to avoid vulgarity)
- Add 30-second countdown timer per turn + autoplay functionality (initial logic for AI bots, just play the first card found that can capture an opponent's card, or the most defensive card available)
- Add keyboard/controller support
- Add hover effect outline for target location when dragging card
- Add all extended game rule options (Open, Chain, Plus)
- Stress tester script, to see how many active games can run at a time, and limit games to that upper bound, to ensure a minimum performance level
- See about adding to https://www.crazygames.com/c/io
- Create AI bot node clients, and allow player to choose to wait for a human or have a bot opponent
- Allow page refresh without quitting match
- Add minimal analytics (number of players/matches/final score)
- Add fun Final Fantasy VIII facts to push to clients while waiting for a game
- Track stats (plays/captures/losses per card and game mode)?
- Permanently store game results (which would enable replays)
- Dynamically create all card content (power numbers, name, border)
- Add support and options for Final Fantasy XIV cards and modes
