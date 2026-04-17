type ClientData = {
    username?: string;
    room_id?: string;
    board?: { hasShip: boolean; shot: boolean }[][];
};
const roomTurns = new Map<string, string>(); // room_id -> username whose turn it is
const playerBoards = new Map<string, { hasShip: boolean; shot: boolean }[][]>();

const server = Bun.serve<ClientData>({
    port: 3000,

    fetch(request: { url: string | URL; }, server: { upgrade: (arg0: any, arg1: { data: { username: string; room_id: string; board: never[]; }; }) => any; }) {
        const url = new URL(request.url);

        if(url.pathname === "/ws") {
            // Handle WebSocket connection
            const username = url.searchParams.get("username") ?? "Anonymous";
            const room_id = url.searchParams.get("room_id") ?? "default-room";

            const upgraded = server.upgrade(request, {
                data: { username, room_id, board: [] }
            });

            if(upgraded) return;
            return new Response("WebSocket upgrade failed", { status: 500 });
        }

        return new Response("Bun WebSocket server is running");
        },

        websocket: {
            open(ws: { data: { username: any; room_id: any; }; subscribe: (arg0: string) => void; publish: (arg0: string, arg1: string) => void; }) {
                console.log(`${ws.data.username} connected to room ${ws.data.room_id}`);
                const channel = `room:${ws.data.room_id}`;
                
                ws.subscribe(channel);

                ws.publish(channel, JSON.stringify({
                    type: "system",
                    message: `${ws.data.username} joined the server`
                }));
            },
            message(ws: { data: any; send: any; publish?: ((arg0: string, arg1: string) => void) | ((arg0: string, arg1: string) => void); }, message: string) {
                let data;
                const channel = `room:${ws.data.room_id}`;
                try {
                    data = JSON.parse(message);
            // If this is the first player, set their turn
            const players = Array.from(playerBoards.keys()).filter(u => u !== undefined);
            if (players.length === 1) {
                roomTurns.set(ws.data.room_id, ws.data.username);
            }
            // Notify both players whose turn it is
            broadcastTurnUpdate(ws.data.room_id);
                } catch (e) {
                    console.error("Failed to parse message:", e);
                    return;
                }
                switch(data.type) {
                    case "attack":
                    handleAttack(ws, data);
                    break;
                    case "boardSetup":
                    handleBoardSetup(ws, data);
                    break;
                    default:
                        ws.send(JSON.stringify({
                            type: "error",
                            message: "Unknown message type"
                        }));
                }

            },
            close(ws: { data: { room_id: any; username: any; }; publish: (arg0: string, arg1: string) => void; }) {
                const channel = `room:${ws.data.room_id}`;
                console.log(`${ws.data.username} disconnected`);
                ws.publish(channel, JSON.stringify({
                    type: "system",
                    message: `${ws.data.username} disconnected`
                }));
            }
        }

});

function broadcastTurnUpdate(room_id: string) {
    const turn = roomTurns.get(room_id);
    const channel = `room:${room_id}`;
    server.publish(channel, JSON.stringify({
        type: "turnUpdate",
        turn
    }));
}

function handleAttack(ws: { data: { room_id: any; username: any; }; send: (arg0: string) => void; publish: (arg0: string, arg1: string) => void; }, data: { x: any; y: any; }) {
        const channel = `room:${ws.data.room_id}`;
        const attacker = ws.data.username;
        const opponent = getOpponentUsername(ws.data.room_id, attacker);
        if (!opponent) {
            ws.send(JSON.stringify({
                type: "error",
                message: "No opponent found."
            }));
            return;
        }
        const board = playerBoards.get(opponent);
        if (!board) {
            ws.send(JSON.stringify({
                type: "error",
                message: "Opponent's board not found."
            }));
            return;
        }
        const { x, y } = data;
        if (x < 0 || y < 0 || y >= board.length || x >= board[0].length) {
            ws.send(JSON.stringify({
                type: "error",
                message: "Invalid attack coordinates."
            }));
            return;
        }
        const cell = board[y][x];
        let result = "miss";
        if (!cell.shot) {
            cell.shot = true;
            if (cell.hasShip) {
                result = "hit";
            }
            // Save updated board
            playerBoards.set(opponent, board);
        } else {
            result = "already";
        }
        ws.publish(channel, JSON.stringify({
            type: "attackResult",
            message: `${attacker} attacked (${x}, ${y}): ${result}`,
            x,
            y,
            result
        }));
    }
// Helper to get opponent username in a room (simple version: first other player found)
    function getOpponentUsername(room_id: any, username: string) {
        for (const [user, board] of playerBoards.entries()) {
            if (user !== username) return user;
        }
        return null;
    }
function handleBoardSetup(ws: { data: { username: string; board: any; room_id: any; }; publish: (arg0: string, arg1: string) => void; }, data: { board: { hasShip: boolean; shot: boolean; }[][]; }) {
        // Save the player's board by username
        if (ws.data.username) {
            playerBoards.set(ws.data.username, data.board);
        }
    ws.data.board = data.board;
    const channel = `room:${ws.data.room_id}`;
    
    ws.publish(channel, JSON.stringify({
        type: "system",
        message: `${ws.data.username} has set up their board`
    }));
}


console.log(`WebSocket server is running on ws://localhost:${server.port}/ws`);