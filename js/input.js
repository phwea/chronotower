/* input.js
   Tracks pressed keys. Call Input.isDown('KeyA') etc.
*/
(function(){
  const down = new Set();

  window.addEventListener('keydown', (e)=>{
    down.add(e.code);
    // Prevent page scroll on Space/Arrow keys when game has focus
    if (["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e)=> down.delete(e.code));

  window.Input = {
    isDown(code){ return down.has(code); }
  };
})();
