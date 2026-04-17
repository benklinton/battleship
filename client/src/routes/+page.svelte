<script lang="ts">
    let username = $state("");
    let room_id = "test-room";
    let messages = $state<string[]>([]);
    let socket: WebSocket | null = null;

    function connect() {
        socket = new WebSocket(
            `ws://localhost:3000/ws?username=${encodeURIComponent(username)}&room_id=${encodeURIComponent(room_id)}`,
        );

        socket.addEventListener("open", () => {
            messages = [...messages, `${username} has connected to the server`];
            socket?.send(JSON.stringify({ type: "boardSetup", board: myBoard }));
        });

        socket.addEventListener("message", (event) => {
            const data = JSON.parse(event.data);
            switch (data.type) {
                case "waiting":
                    // Handle waiting message
                    break;
                case "attackResult":
                    handleAttackResult(data);
                    break;
                case "opponentAttack":
                    // Handle opponent attack message
                    break;
                case "turnUpdate":
                    // Handle turn update message
                    break;
                case "system":
                    messages = [...messages, `${data.message}`];
                    break;
                case "error":
                    console.error("Error message:", data.message);
                    break;
                default:
                    console.error("Unknown message type:", data.type);
            }
        });

        socket.addEventListener("close", () => {
            messages = [
                ...messages,
                `${username} has disconnected from server`,
            ];
        });
    }


    function disconnect() {
        socket?.close();
        socket = null;
    }
    let myBoard = createRandomBoard();
    let enemyBoard = createEmptyBoard();
    let isMyTurn = false;
    let phase = "playing";

    function createEmptyBoard(size = 10) {
        return Array.from({ length: size }, () =>
            Array.from({ length: size }, () => ({
                hasShip: false,
                shot: false,
            })),
        );
    }

    function createRandomBoard(size = 10) {
        const board = createEmptyBoard(size);
        const shipSizes = [5, 4, 3, 3, 2];
        for (const shipSize of shipSizes) {
            let placed = false;
            while (!placed) {
                const x = Math.floor(Math.random() * size);
                const y = Math.floor(Math.random() * size);
                const horizontal = Math.random() < 0.5;
                if (canPlaceShip(board, x, y, shipSize, horizontal)) {
                    placeShip(board, x, y, shipSize, horizontal);
                    placed = true;
                }
            }
        }
        return board;
    }

    // Look away child, for this is a monster of a function
    function canPlaceShip(board: { hasShip: boolean; shot: boolean }[][], x: number, y: number, shipSize: number, horizontal: boolean) {
        const size = board.length;
        let xStart, xEnd, yStart, yEnd;
        if (horizontal) {
            if (x + shipSize > size) return false;
            xStart = Math.max(0, x - 1);
            xEnd = Math.min(size - 1, x + shipSize);
                        let currentTurn = "";
            yStart = Math.max(0, y - 1);
            yEnd = Math.min(size - 1, y + 1);
            for (let i = xStart; i <= xEnd; i++) {
                for (let j = yStart; j <= yEnd; j++) {
                    if (board[j][i].hasShip) return false;
                }
            }
        } else {
            if (y + shipSize > size) return false;
            xStart = Math.max(0, x - 1);
            xEnd = Math.min(size - 1, x + 1);
            yStart = Math.max(0, y - 1);
            yEnd = Math.min(size - 1, y + shipSize);
            for (let i = xStart; i <= xEnd; i++) {
                for (let j = yStart; j <= yEnd; j++) {
                    if (board[j][i].hasShip) return false;
                }
            }
        }
        return true;
    }

    function placeShip(board: { hasShip: boolean; shot: boolean }[][], x: number, y: number, shipSize: number, horizontal: boolean) {
        if (horizontal) {
            for (let i = 0; i < shipSize; i++) {
                board[y][x + i].hasShip = true;
            }
        } else {
            for (let i = 0; i < shipSize; i++) {
                board[y + i][x].hasShip = true;
            }
        }
    }


    function handleEnemyBoardClick(x: number, y: number) {
        if (phase !== "playing") return;
        if (!isMyTurn) return;

        const cell = enemyBoard[y][x];
        if (cell.shot) return;

        socket?.send(JSON.stringify({ type: "attack", x, y }));
        isMyTurn = false;
        
    }

    function handleAttackResult(data: { x: number; y: number; result: string; }) {
        const { x, y, result } = data;
        console.log(`Attack result at (${x}, ${y}): ${result}`);
        // Update the cell
        enemyBoard[y][x].shot = true;
        if (result === "hit") {
            enemyBoard[y][x].hasShip = true;
        }
        // Reassign to trigger Svelte reactivity
        enemyBoard = enemyBoard.map((row, rowIdx) =>
            row.map((cell, colIdx) =>
                rowIdx === y && colIdx === x ? { ...cell } : cell
            )
        );
        isMyTurn = true;
    }
    
</script>

<h1>Online Battleship</h1>
<h2>Phase: {isMyTurn ? "Your Turn" : "Opponent's Turn"}</h2>
<div class="game">
    <div class="board">
        <h3>Your Board</h3>
        {#each myBoard as row, y}
            <div class="row">
                {#each row as cell, x}
                    <button
                        title={`(${x}, ${y})`}
                        class="cell"
                        class:ship={cell.hasShip}
                        class:hit={cell.shot && cell.hasShip}
                        class:miss={cell.shot && !cell.hasShip}
                    >
                    </button>
                {/each}
            </div>
        {/each}
    </div>
    <div class="board">
        <h3>Enemy Board</h3>
        {#each enemyBoard as row, y}
            <div class="row">
                {#each row as cell, x}
                    <button
                        title={`(${x}, ${y})`}
                        class="cell"
                        class:ship={cell.hasShip}
                        class:hit={cell.shot && cell.hasShip}
                        class:miss={cell.shot && !cell.hasShip}
                        onclick={() => handleEnemyBoardClick(x, y)}
                    >
                    </button>
                {/each}
            </div>
        {/each}
    </div>
</div>

<input type="text" bind:value={username} placeholder="Enter username" />
<button onclick={connect}>Connect</button>
<button onclick={disconnect}>Disconnect</button>
<ul>
    {#each messages as msg}
        <li>{msg}</li>
    {/each}
</ul>
