// input.js — keyboard and mouse state for the whole game. One Input object
// is created by main.js and passed around; systems poll `held` for movement
// and consume one-shot presses with `pressed`, which the game loop clears
// at the end of every frame so a tap can never fire twice.

export class Input {
  constructor(domElement) {
    this.keys = new Set();       // codes currently held down
    this.fresh = new Set();      // codes that went down this frame
    this.mouseDX = 0;            // accumulated mouse movement since last frame
    this.mouseDY = 0;
    this.mouseDown = false;
    this.freshMouseDown = false;
    this.enabled = true;         // title and dossier screens turn this off

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (!this.keys.has(e.code)) this.fresh.add(e.code);
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });

    domElement.addEventListener('mousemove', (e) => {
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
    domElement.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouseDown = true; this.freshMouseDown = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
  }

  held(...codes) {
    if (!this.enabled) return false;
    return codes.some((c) => this.keys.has(c));
  }

  pressed(...codes) {
    if (!this.enabled) return false;
    return codes.some((c) => this.fresh.has(c));
  }

  attackHeld() {
    return this.enabled && this.mouseDown;
  }

  attackFresh() {
    return this.enabled && this.freshMouseDown;
  }

  // Called once at the end of each frame by the game loop.
  endFrame() {
    this.fresh.clear();
    this.freshMouseDown = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}

// Movement axes shared by the on-foot and driving controllers, WASD and
// arrows both, returned as -1..1 values.
export function moveAxes(input) {
  const forward = (input.held('KeyW', 'ArrowUp') ? 1 : 0) - (input.held('KeyS', 'ArrowDown') ? 1 : 0);
  const strafe = (input.held('KeyD', 'ArrowRight') ? 1 : 0) - (input.held('KeyA', 'ArrowLeft') ? 1 : 0);
  return { forward, strafe };
}
