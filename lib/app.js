require("dotenv").config();
require("./utils/connect")();

const express = require("express");
const http = require("http");
const { SSL_OP_SSLEAY_080_CLIENT_DH_BUG } = require("constants");
const app = express();
const server = http.createServer(app);
const io = require("socket.io")(server);

app.use(
  require("cors")({
    origin: function (origin, callback) {
      return callback(null, true);
    },
    credentials: true,
  })
);

app.use(require("cookie-parser")());
app.use(express.json());
app.use(express.urlencoded());
app.use(express.static("/client/public"));
app.use(require("./middleware/not-found"));
app.use(require("./middleware/error"));

const startServer = () => {
  server.listen(7890);
  console.log("server started on port 7890...");
};

let onlinePlayers = [];
let gameState = {
  bullets: [],
  rectangles: [],
};

for (let i = 0; i < 10; i++) {
  gameState.rectangles.push({
    x: Math.floor(Math.random() * 800) + 1,
    y: Math.floor(Math.random() * 800) + 1,
    height: 100,
    width: 100,
  });
}

/// ENTITIES - CLASSES ///

class Entity {
  constructor(id) {
    this.x = 100;
    this.y = 100;
    this.speedX = 0;
    this.speedY = 0;
    this.id = id;
  }

  updateEntity() {
    this.updateEntityPosition();
  }

  updateEntityPosition() {
    this.x += this.speedX;
    this.y += this.speedY;
  }

  getDistance(point) {
    return Math.sqrt(
      Math.pow(this.x - point.x, 2) + Math.pow(this.y - point.y, 2)
    );
  }
}

//// PLAYER  CLASS - SERVER ///

class Player extends Entity {
  constructor(id) {
    super(id);
    this.height = 50;
    this.width = 50;
    this.movingUp = false;
    this.movingDown = false;
    this.movingLeft = false;
    this.movingRight = false;
    this.maxSpeed = 5;
    this.typing = false;
    this.height = 50;
    this.width = 50;
    this.hp = 100;
    this.hpMax = 100;
    this.pressingAttack = false;
    this.mouseAngle = 0;
    this.score = 0;
    this.typing = false;
  }

  update(gameState) {
    this.updateSpd(gameState);
    this.updateEntity();
    this.handleMapBoundaries();
    this.handleAttack();
  }

  handleCollision(rect) {
    if (
      this.x < rect.x + rect.width &&
      this.x + this.width > rect.x &&
      this.y < rect.y + rect.height &&
      this.y + this.height > rect.y
    ) {
      if (this.x < rect.x && this.x < rect.x) {
        this.x = this.x - 5;
      }
      if (this.x > rect.x && this.x > rect.x) {
        this.x = this.x + 5;
      }

      if (this.y > rect.y - 50 && this.y < rect.y) {
        this.y = this.y - 5;
      }

      if (this.y < rect.y + rect.height && this.y > rect.y) {
        this.y = this.y + 5;
      }
    }
  }

  handleAttack() {
    if (this.pressingAttack) {
      const bullet = new Bullet(this.mouseAngle, this.id);
      bullet.x = this.x;
      bullet.y = this.y;

      gameState.bullets.push(bullet);
    }
  }

  handleMapBoundaries() {
    if (this.x > 750) {
      this.x = this.x - 10;
    }

    if (this.x < 0) {
      this.x = this.x + 10;
    }

    if (this.y > 750) {
      this.y = this.y - 10;
    }

    if (this.y < 0) {
      this.y = this.y + 10;
    }
  }

  updateSpd(gameState) {
    const previousPosition = {
      x: this.x,
      y: this.y,
    };

    gameState.rectangles.forEach((rect) => {
      this.handleCollision(rect);
    });

    if (this.movingRight) {
      this.speedX = this.maxSpeed;
    } else if (this.movingLeft) {
      this.speedX = -this.maxSpeed;
    } else {
      this.speedX = 0;
    }

    if (this.movingUp) {
      this.speedY = -this.maxSpeed;
    } else if (this.movingDown) {
      this.speedY = this.maxSpeed;
    } else {
      this.speedY = 0;
    }

    if (this.typing) {
      this.speedX = 0;
      this.speedY = 0;
    }
  }

  getInitPack() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      hp: this.hp,
      hpMax: this.hpMax,
    };
  }

  getUpdatePack() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      hp: this.hp,
      score: this.score,
      typing: this.typing,
    };
  }
}

/// BULLET CLASS - SERVER ///

class Bullet extends Entity {
  constructor(angle, parent) {
    super(Math.random());
    this.parent = parent;
    this.spdX = Math.cos((angle / 180) * Math.PI) * 10;
    this.spdY = Math.sin((angle / 180) * Math.PI) * 10;
    this.timer = 0;
    this.toRemove = false;
    this.range = 20;
    this.width = 10;
    this.height = 10;
  }

  update(onlinePlayers) {
    this.updateEntity();

    if (this.timer++ > this.range) {
      this.toRemove = true;
    }

    onlinePlayers.forEach((player) => {
      if (this.getDistance(player) < 50 && this.parent !== player.id) {
        player.hp -= 1;

        const shooter = onlinePlayers.find((p) => p.id === this.id);

        if (player.hp <= 0) {
          player.hp = player.hpMax;
          player.x = Math.random() * 500;
          player.y = Math.random() * 500;

          if (shooter) {
            shooter.score += 1;
          }
        }

        this.toRemove = true;
      }

      if (this.toRemove) {
        gameState.bullets.splice(this, 1);
      }
    });
  }

  getInitPack() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
    };
  }

  getUpdatePack() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
    };
  }
}

///////

////// HANDLE SOCKET CONNECTION ///

io.on("connection", (socket) => {
  const player = new Player(socket.id, 10, 10);

  if (!onlinePlayers.includes(player)) {
    onlinePlayers.push(player);
  }

  const initBullets = () => {
    const bullets = gameState.bullets.map((bullet) => bullet.getInitPack());
    return bullets;
  };

  socket.emit("init", {
    id: player.id,
    players: [],
    bullets: initBullets(),
    rectangles: [],
  });

  socket.on("disconnect", () => {
    const disconnected = onlinePlayers.find((p) => p === socket.id);
    onlinePlayers.splice(disconnected, 1);

    io.emit("players", onlinePlayers);
  });

  socket.on("PLAYER_INPUT", (event) => {
    if (event.input === "attack") {
      if (event.state === true) {
        player.pressingAttack = true;
      } else {
        player.pressingAttack = false;
      }
    }

    //TODO: MOUSE ANGLE
    // if (event.input === "mouseAngle") {
    //   player.mouseAngle = event.direction;
    // }

    if (event.input === "keyDown") {
      if (event.direction === "up") {
        player.movingUp = true;
      } else if (event.direction === "down") {
        player.movingDown = true;
      } else if (event.direction === "left") {
        player.movingLeft = true;
      } else if (event.direction === "right") {
        player.movingRight = true;
      }
    }

    if (event.input === "keyUp") {
      if (event.direction === "up") {
        player.movingUp = false;
      } else if (event.direction === "down") {
        player.movingDown = false;
      } else if (event.direction === "left") {
        player.movingLeft = false;
      } else if (event.direction === "right") {
        player.movingRight = false;
      }
    }
  });

  setInterval(gameLoop, 66);

  const initPack = { players: [], bullets: [] };
  const removePack = { players: [], bullets: [] };

  const updatePlayers = () => {};
  const updateBullets = () => {};

  function gameLoop() {
    const updatePack = {
      players: updatePlayers(),
      bullets: updateBullets(),
    };

    gameState.bullets.forEach((bullet) => {
      bullet.update(onlinePlayers);
    });

    onlinePlayers.forEach((player) => {
      player.update(gameState);
    });

    io.emit("updatePack", updatePack);
    io.emit("removePack", removePack);

    initPack.players = [];
    initPack.bullets = [];
    removePack.players = [];
    removePack.bullets = [];
  }
});

startServer();
