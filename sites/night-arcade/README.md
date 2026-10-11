# Cyber Runner 🏃‍♂️⚡

A cyberpunk-themed rooftop endless runner browser game inspired by Canabalt. Built with vanilla JavaScript and HTML5 Canvas.

![Cyber Runner](https://img.shields.io/badge/Game-Endless%20Runner-ff00ff)
![Tech](https://img.shields.io/badge/Tech-HTML5%20Canvas-00ffff)
![License](https://img.shields.io/badge/License-MIT-green)

## 🎮 Play the Game

Simply open `index.html` in a modern web browser to play!

### Controls

- **Spacebar** or **Tap** - Jump
- **Hold** - Higher jump

## ✨ Features

- **Rooftop Running** - Jump between procedurally generated buildings
- **Cyberpunk Aesthetic** - Neon colors, rain effects, parallax scrolling cityscape
- **Simple One-Button Gameplay** - Easy to learn, hard to master
- **Dynamic Difficulty** - Speed increases and gaps get wider over time
- **Variable Building Heights** - Buildings at different levels add challenge
- **High Score System** - Persists using localStorage
- **Procedural Audio** - Synthesized sound effects and music using Web Audio API
- **Mobile Support** - Touch controls for mobile browsers

## 🚀 Performance

- Targets **60 FPS** on mid-range hardware
- Uses **object pooling** for obstacles and particles
- Efficient **Canvas 2D rendering**
- Lazy asset generation with caching

## 📦 Project Structure

```
cyber-runner/
├── index.html          # Main HTML file
├── styles.css          # Game styles and UI
├── js/
│   ├── game.js         # Main game loop and state management
│   ├── player.js       # Player mechanics and animation
│   ├── world.js        # Procedural world generation
│   ├── renderer.js     # Canvas rendering with parallax
│   ├── physics.js      # Collision detection
│   ├── audio.js        # Web Audio sound system
│   ├── assets.js       # Procedural asset generation
│   └── utils.js        # Utility functions and object pools
└── README.md
```

## 🔧 Embedding

### Option 1: iframe
```html
<iframe 
  src="path/to/cyber-runner/index.html" 
  width="800" 
  height="600"
  frameborder="0">
</iframe>
```

### Option 2: Direct Integration
Copy all files to your project and include in your HTML:
```html
<div id="game-container">
  <canvas id="game-canvas"></canvas>
  <!-- Copy menu/HUD elements from index.html -->
</div>

<link rel="stylesheet" href="path/to/styles.css">
<script src="path/to/js/utils.js"></script>
<script src="path/to/js/audio.js"></script>
<script src="path/to/js/assets.js"></script>
<script src="path/to/js/physics.js"></script>
<script src="path/to/js/player.js"></script>
<script src="path/to/js/world.js"></script>
<script src="path/to/js/renderer.js"></script>
<script src="path/to/js/game.js"></script>
<script>
  const game = new Game('game-canvas');
</script>
```

## 🎨 Customization

### Colors
Edit the color palettes in `js/assets.js`:
```javascript
this.colors = {
    neonPink: '#ff00ff',
    neonCyan: '#00ffff',
    neonYellow: '#ffff00',
    // ... more colors
};
```

### Difficulty
Adjust in `js/world.js`:
```javascript
this.baseSpeed = 5;          // Starting speed
this.maxSpeed = 15;          // Maximum speed
this.speedIncreaseRate = 0.001; // How fast difficulty ramps
```

### Physics
Tweak in `js/physics.js`:
```javascript
this.gravity = 0.6;
this.terminalVelocity = 15;
```

And in `js/player.js`:
```javascript
this.jumpPower = -14;        // Initial jump velocity
this.maxJumpHoldTime = 150;  // Variable jump duration (ms)
```

## 🌐 Browser Support

- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+
- Mobile browsers with touch support

## 📄 License

MIT License - Feel free to use, modify, and distribute!

## 🎯 Future Enhancements

- [ ] Additional obstacle types
- [ ] Boss encounters
- [ ] Achievement system
- [ ] Leaderboard integration
- [ ] Character skins
- [ ] WebGL rendering option

---

Made with 💜 and lots of neon
