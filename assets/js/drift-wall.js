(function () {
  "use strict";

  const wall = document.querySelector("[data-drift-wall]");
  const plane = wall?.querySelector("[data-drift-plane]");
  if (!wall || !plane) return;

  const photos = [
    ["carrossel-1.webp", "Carros amarelos em um encontro automotivo"],
    ["carrossel-2.webp", "Honda Civic exposto no Only Cars Meeting"],
    ["carrossel-3.webp", "Público reunido entre os carros expostos"],
    ["carrossel-4.webp", "Carros alinhados em um encontro urbano"],
    ["carrossel-5.webp", "Volkswagen rebaixados em exposição"],
    ["carrossel-6.webp", "Chevrolet Astra no Only Cars Meeting"]
  ];
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const columns = matchMedia("(max-width: 760px)").matches ? 4 : 6;
  const tracks = [];
  const offsets = [];
  const velocities = [];
  const factors = [0.82, 1.14, 0.94, 1.22, 0.88, 1.08];
  let hoveredColumn = -1;
  let pointer = { x:0, y:0 };
  let damped = { x:0, y:0 };
  let lastTime = 0;
  let frame = 0;

  function makeTile(photo, column, copy, index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "drift-wall__tile";
    button.dataset.column = String(column);
    button.setAttribute("aria-label", photo[1]);
    button.innerHTML = `<span class="drift-wall__inner"><img src="assets/images/events/meeting-history/${photo[0]}" alt="${photo[1]}" loading="lazy" decoding="async" draggable="false"></span>`;
    button.dataset.tile = `${column}-${copy}-${index}`;
    return button;
  }

  for (let column = 0; column < columns; column += 1) {
    const columnNode = document.createElement("div");
    const track = document.createElement("div");
    columnNode.className = "drift-wall__col";
    track.className = "drift-wall__track";
    for (let copy = 0; copy < 4; copy += 1) {
      photos.forEach((_, index) => {
        const photo = photos[(index + column * 2) % photos.length];
        track.appendChild(makeTile(photo, column, copy, index));
      });
    }
    columnNode.appendChild(track);
    plane.appendChild(columnNode);
    tracks.push(track);
    offsets.push(column * 137);
    velocities.push(0);
  }

  function dimensions() {
    const styles = getComputedStyle(wall);
    return parseFloat(styles.getPropertyValue("--dw-tile-h")) + parseFloat(styles.getPropertyValue("--dw-gap"));
  }

  function setActive(target) {
    wall.querySelectorAll(".is-active").forEach((tile) => tile.classList.remove("is-active"));
    const tile = target?.closest?.(".drift-wall__tile");
    if (!tile) {
      hoveredColumn = -1;
      return;
    }
    tile.classList.add("is-active");
    hoveredColumn = Number(tile.dataset.column);
  }

  wall.addEventListener("pointermove", (event) => {
    const rect = wall.getBoundingClientRect();
    pointer = {
      x:(event.clientX - rect.left) / rect.width - 0.5,
      y:(event.clientY - rect.top) / rect.height - 0.5
    };
    setActive(document.elementFromPoint(event.clientX, event.clientY));
  });
  wall.addEventListener("pointerleave", () => {
    pointer = { x:0, y:0 };
    setActive(null);
  });
  wall.addEventListener("focusin", (event) => setActive(event.target));
  wall.addEventListener("focusout", () => setActive(null));

  function animate(time) {
    const delta = lastTime ? Math.min(0.05, (time - lastTime) / 1000) : 0;
    lastTime = time;
    const ease = 1 - Math.exp(-delta / 0.12);
    damped.x += (pointer.x - damped.x) * ease;
    damped.y += (pointer.y - damped.y) * ease;
    const mobile = matchMedia("(max-width: 760px)").matches;
    plane.style.transform = `translate(-50%,-50%) scale(${mobile ? 1.2 : 1.16}) rotateX(${20 - damped.y * 7}deg) rotateY(${-18 + damped.x * 8}deg) translateZ(-125px)`;

    if (!reduceMotion.matches) {
      const loopHeight = dimensions() * photos.length;
      tracks.forEach((track, column) => {
        const direction = column % 2 === 0 ? 1 : -1;
        const target = hoveredColumn === column ? 0 : 24 * factors[column % factors.length] * direction;
        velocities[column] += (target - velocities[column]) * (1 - Math.exp(-delta / 0.2));
        offsets[column] = ((offsets[column] + velocities[column] * delta) % loopHeight + loopHeight) % loopHeight;
        track.style.transform = `translate3d(0,${-offsets[column]}px,0)`;
      });
    }
    frame = requestAnimationFrame(animate);
  }

  frame = requestAnimationFrame(animate);
  addEventListener("pagehide", () => cancelAnimationFrame(frame), { once:true });
})();
