// --- Types ---
type Cell = { hasShip: boolean; shot: boolean };
type Board = Cell[][];

type ClientData = {
    username: string;
    room_id: string;
};

type Room = {
    players: string[];                        // usernames in join order
    boards: Map<string, Board>;               // username -> board
    turn: string | null;                      // whose turn
    phase: "waiting" | "playing" | "gameover"; // room state
};

// --- State ---
const rooms = new Map<string, Room>();
const playerSockets = new Map<string, any>(); // username -> ws (for direct sends)

function getOrCreateRoom(room_id: string): Room {
    let room = rooms.get(room_id);
    if (!room) {
        room = { players: [], boards: new Map(), turn: null, phase: "waiting" };
        rooms.set(room_id, room);
    }
    return room;
}

// --- Server ---
const server = Bun.serve<ClientData>({
    port: 3000,

    fetch(request, server) {
        const url = new URL(request.url);

        if (url.pathname === "/ws") {
            const username = url.searchParams.get("username")?.trim();
            const room_id = url.searchParams.get("room_id")?.trim();

            if (!username || !room_id) {
                return new Response("Missing username or room_id", { status: 400 });
            }

            const room = getOrCreateRoom(room_id);
            if (room.players.length >= 2 && !room.players.includes(username)) {
                return new Response("Room is full", { status: 403 });
            }

            const upgraded = server.upgrade(request, {
                data: { username, room_id },
            });

            if (upgraded) return;
            return new Response("WebSocket upgrade failed", { status: 500 });
        }

        return new Response("Battleship server running");
    },

    websocket: {
        open(ws) {
            const { username, room_id } = ws.data;
            const channel = `room:${room_id}`;
            const room = getOrCreateRoom(room_id);

            // Track socket for direct messaging
            playerSockets.set(username, ws);

            // Add player to room if not already there
            if (!room.players.includes(username)) {
                room.players.push(username);
            }

            ws.subscribe(channel);

            // Notify others
            ws.publish(channel, JSON.stringify({
                type: "system",
                message: `${username} joined the room`,
            }));

            // Tell this player how many are in the room
            ws.send(JSON.stringify({
                type: "system",
                message: `You joined room "${room_id}". Players: ${room.players.length}/2`,
            }));

            if (room.players.length < 2) {
                ws.send(JSON.stringify({ type: "waiting", message: "Waiting for opponent..." }));
            }

            console.log(`${username} connected to room ${room_id} (${room.players.length}/2)`);
        },

        message(ws, message) {
            let data: any;
            try {
                data = JSON.parse(message as string);
            } catch {
                ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
                return;
            }

            switch (data.type) {
                case "boardSetup":
                    handleBoardSetup(ws, data);
                    break;
                case "attack":
                    handleAttack(ws, data);
                    break;
                default:
                    ws.send(JSON.stringify({ type: "error", message: "Unknown message type" }));
            }
        },

        close(ws) {
            const { username, room_id } = ws.data;
            const channel = `room:${room_id}`;

            playerSockets.delete(username);

            const room = rooms.get(room_id);
            if (room) {
                room.players = room.players.filter((p) => p !== username);
                room.boards.delete(username);
                room.phase = "waiting";
                room.turn = null;

                if (room.players.length === 0) {
                    rooms.delete(room_id);
                }
            }

            ws.publish(channel, JSON.stringify({
                type: "system",
                message: `${username} disconnected`,
            }));

            // Notify remaining player
            if (room && room.players.length === 1) {
                const remaining = playerSockets.get(room.players[0]);
                if (remaining) {
                    remaining.send(JSON.stringify({
                        type: "opponentDisconnected",
                        message: "Your opponent disconnected. Waiting for a new player...",
                    }));
                }
            }

            console.log(`${username} disconnected from room ${room_id}`);
        },
    },
});

// --- Handlers ---
function handleBoardSetup(ws: any, data: { board: Board }) {
    const { username, room_id } = ws.data;
    const room = getOrCreateRoom(room_id);

    room.boards.set(username, data.board);

    ws.send(JSON.stringify({ type: "system", message: "Your board is ready." }));

    const channel = `room:${room_id}`;
    ws.publish(channel, JSON.stringify({
        type: "system",
        message: `${username} is ready`,
    }));

    // Check if both players have boards (game can start)
    if (room.players.length === 2 && room.boards.size === 2) {
        startGame(room_id);
    }
}

function startGame(room_id: string) {
    const room = rooms.get(room_id);
    if (!room) return;

    room.phase = "playing";
    room.turn = room.players[0]; // first player to join goes first

    const channel = `room:${room_id}`;
    server.publish(channel, JSON.stringify({
        type: "gameStart",
        message: "Both players ready. Game begins!",
    }));

    // Also send to both players directly (publish doesn't send to self)
    for (const player of room.players) {
        const sock = playerSockets.get(player);
        if (sock) {
            sock.send(JSON.stringify({ type: "gameStart", message: "Both players ready. Game begins!" }));
            sock.send(JSON.stringify({ type: "turnUpdate", turn: room.turn }));
        }
    }
}

function handleAttack(ws: any, data: { x: number; y: number }) {
    const { username, room_id } = ws.data;
    const room = rooms.get(room_id);

    if (!room || room.phase !== "playing") {
        ws.send(JSON.stringify({ type: "error", message: "Game is not in progress." }));
        return;
    }

    if (room.turn !== username) {
        ws.send(JSON.stringify({ type: "error", message: "It's not your turn." }));
        return;
    }

    const opponent = room.players.find((p) => p !== username);
    if (!opponent) {
        ws.send(JSON.stringify({ type: "error", message: "No opponent found." }));
        return;
    }

    const board = room.boards.get(opponent);
    if (!board) {
        ws.send(JSON.stringify({ type: "error", message: "Opponent board not found." }));
        return;
    }

    const { x, y } = data;
    if (x < 0 || y < 0 || y >= board.length || x >= board[0].length) {
        ws.send(JSON.stringify({ type: "error", message: "Invalid coordinates." }));
        return;
    }

    const cell = board[y][x];
    if (cell.shot) {
        ws.send(JSON.stringify({ type: "error", message: "Already shot there." }));
        return;
    }

    cell.shot = true;
    const result = cell.hasShip ? "hit" : "miss";

    // Send result to attacker
    ws.send(JSON.stringify({ type: "attackResult", x, y, result }));

    // Notify opponent that they were attacked
    const opponentSocket = playerSockets.get(opponent);
    if (opponentSocket) {
        opponentSocket.send(JSON.stringify({ type: "opponentAttack", x, y, result }));
    }

    // Check win condition
    if (checkWin(board)) {
        room.phase = "gameover";
        ws.send(JSON.stringify({ type: "gameOver", winner: username, message: "You win!" }));
        if (opponentSocket) {
            opponentSocket.send(JSON.stringify({ type: "gameOver", winner: username, message: "You lose!" }));
        }
        return;
    }

    // Switch turns
    room.turn = opponent;
    for (const player of room.players) {
        const sock = playerSockets.get(player);
        if (sock) {
            sock.send(JSON.stringify({ type: "turnUpdate", turn: room.turn }));
        }
    }
}

function checkWin(board: Board): boolean {
    for (const row of board) {
        for (const cell of row) {
            if (cell.hasShip && !cell.shot) return false;
        }
    }
    return true;
}

console.log(`Battleship server running on ws://localhost:${server.port}/ws`);