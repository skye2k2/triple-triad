# Triple Triad

Based on a game that once existed in our universe. No ads, no cost, no third-party logins. Just games.

Built with Node.js, Socket.io, and FabricJS.

## Stats and Performance

Client initial load weighs in at < 650KB, and utilizes heavy caching for all resources, so that subsequent views are < 50KB.
Node server runs empty at < 20MB of RAM, with 11 threads.

- Each subsequent/simultaneous match (mostly because of the running game log) adds < 2MB of memory usage, and is mostly reclaimed when the connection ends
- Running game logic for three fully automated bot matches does not spike above 3% CPU utilization on a 2.2 GHz core i7 processor (thanks, Socket.io!)
- Extrapolated theory: 100 simultaneous human matches can run with minimal disruption to the event loop (TODO: Test this)

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
- Only active player can play cards
- Server-side validation of cards & card placement, to keep things from being too easy for hackers
- Sound effects for playing and flipping cards, and winning and losing the match
- Shuffle or Boogie music (remix by Simple Music), with subtle playing indication (notes bounce in time to the music)
- Immediate rematch option given to both players
- Basic AI

#### TODO List:

- IN-PROGRESS: Allow users to half-start a game (lobby), then send a code/URL to have their friend join them, jackbox-style
  - After the second player has joined, anyone else will just be a spectator (tricky bit)
  - Allow spectators to connect to matches in progress (replay from game log)
  - List matches in progress on home screen
- Allow player to choose to wait for a human or have a bot opponent
- HALF DONE: Resize all of the elements in the canvas on page resize (especially for orientation changes on phones)
- Perfectly centered game board and title positioning
- Add board background art
- Allow users to choose names (maybe from a selection of FF VIII characters, to avoid vulgarity)
- Add 30-second countdown timer per turn + autoplay functionality (initial logic for AI bots, just play the first card found that can capture an opponent's card, or the most defensive card available)
- Add keyboard/controller support
- Add effects for clicking rematch buttons, with indicator of if opponent wants a rematch
- Add hover effect outline for target location when dragging card
- Add all extended game rule options (Open, Chain, Plus)
- Stress tester script, to see how many active games can run at a time, and limit games to that upper bound, to ensure a minimum performance level (https://stackoverflow.com/a/16426868/5334305)
- See about adding to https://www.crazygames.com/c/io
- Allow page refresh without quitting match
- Add minimal analytics (number of players/matches/final score)
- Add fun Final Fantasy VIII facts to push to clients while waiting for a game
- Track stats (plays/captures/losses per card and game mode)?
- Permanently store game results (which would enable replays)
- Dynamically create all card content (power numbers, name, border)
- Add support and options for Final Fantasy XIV cards and modes
