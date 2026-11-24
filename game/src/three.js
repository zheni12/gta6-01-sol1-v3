// three.js — the single bridge to the vendored three.js library. index.html
// loads game/vendor/three.min.js with a classic script tag before this
// module runs, so the library is on the global object; every other module
// imports THREE from here and never touches the global itself.
export const THREE = window.THREE;

if (!THREE) {
  throw new Error('three.min.js did not load: window.THREE is missing');
}
