<script lang="ts">
    let username = $state("");
    let room_id = $state("test-room");
    let messages = $state<string[]>([]);
    let socket: WebSocket | null = $state(null);

    type Cell = { hasShip: boolean; shot: boolean };

    let myBoard = $state<Cell[][]>(createRandomBoard());
    let enemyBoard = $state<Cell[][]>(createEmptyBoard());
    let isMyTurn = $state(false);
    let phase = $state<"lobby" | "waiting" | "playing" | "gameover">("lobby");
    let statusMessage = $state("");
    let gameResult = $state("");

    function connect() {
        if (!username.trim()) return;

        socket = new WebSocket(
            `ws://localhost:3000/ws?username=${encodeURIComponent(username.trim())}&room_id=${encodeURIComponent(room_id.trim())}`,
        );

        socket.addEventListener("open", () => {
            addMessage(`Connected to room "${room_id}"`);
            socket?.send(JSON.stringify({ type: "boardSetup", board: myBoard }));
            phase = "waiting";
            statusMessage = "Waiting for opponent...";
        });

        socket.addEventListener("message", (event) => {
            const data = JSON.parse(event.data);
            switch (data.type) {
                case "waiting":
                    statusMessage = data.message;
                    break;
                case "gameStart":
                    phase = "playing";
                    addMessage(data.message);
                    break;
                case "turnUpdate":
                    isMyTurn = data.turn === username.trim();
                    statusMessage = isMyTurn ? "Your turn — click the enemy board" : "Opponent's turn...";
                    break;
                case "attackResult":
                    handleAttackResult(data);
                    break;
                case "opponentAttack":
                    handleOpponentAttack(data);
                    break;
                case "gameOver":
                    phase = "gameover";
                    gameResult = data.message;
                    statusMessage = data.message;
                    addMessage(`Game over: ${data.message}`);
                    break;
                case "opponentDisconnected":
                    phase = "waiting";
                    statusMessage = data.message;
                    addMessage(data.message);
                    // Reset enemy board
                    enemyBoard = createEmptyBoard();
                    break;
                case "system":
                    addMessage(data.message);
                    break;
                case "error":
                    addMessage(`Error: ${data.message}`);
                    break;
                default:
                    console.warn("Unknown message type:", data.type);
            }
        });

        socket.addEventListener("close", () => {
            addMessage("Disconnected from server");
            phase = "lobby";
            statusMessage = "";
            isMyTurn = false;
        });
    }

    function disconnect() {
        socket?.close();
        socket = null;
    }

    function newGame() {
        myBoard = createRandomBoard();
        enemyBoard = createEmptyBoard();
        isMyTurn = false;
        gameResult = "";
        phase = "lobby";
        statusMessage = "";
        messages = [];
    }

    function addMessage(msg: string) {
        messages = [...messages, msg];
    }

    function createEmptyBoard(size = 10): Cell[][] {
        return Array.from({ length: size }, () =>
            Array.from({ length: size }, () => ({
                hasShip: false,
                shot: false,
            })),
        );
    }

    function createRandomBoard(size = 10): Cell[][] {
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

    function canPlaceShip(board: Cell[][], x: number, y: number, shipSize: number, horizontal: boolean): boolean {
        const size = board.length;
        if (horizontal) {
            if (x + shipSize > size) return false;
            const xStart = Math.max(0, x - 1);
            const xEnd = Math.min(size - 1, x + shipSize);
            const yStart = Math.max(0, y - 1);
            const yEnd = Math.min(size - 1, y + 1);
            for (let i = xStart; i <= xEnd; i++) {
                for (let j = yStart; j <= yEnd; j++) {
                    if (board[j][i].hasShip) return false;
                }
            }
        } else {
            if (y + shipSize > size) return false;
            const xStart = Math.max(0, x - 1);
            const xEnd = Math.min(size - 1, x + 1);
            const yStart = Math.max(0, y - 1);
            const yEnd = Math.min(size - 1, y + shipSize);
            for (let i = xStart; i <= xEnd; i++) {
                for (let j = yStart; j <= yEnd; j++) {
                    if (board[j][i].hasShip) return false;
                }
            }
        }
        return true;
    }

    function placeShip(board: Cell[][], x: number, y: number, shipSize: number, horizontal: boolean) {
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
        if (phase !== "playing" || !isMyTurn) return;
        if (enemyBoard[y][x].shot) return;

        socket?.send(JSON.stringify({ type: "attack", x, y }));
        isMyTurn = false;
        statusMessage = "Opponent's turn...";
    }

    function handleAttackResult(data: { x: number; y: number; result: string }) {
        const { x, y, result } = data;
        enemyBoard[y][x] = {
            hasShip: result === "hit",
            shot: true,
        };
        addMessage(`You fired at (${x}, ${y}): ${result.toUpperCase()}`);
    }

    function handleOpponentAttack(data: { x: number; y: number; result: string }) {
        const { x, y, result } = data;
        myBoard[y][x] = { ...myBoard[y][x], shot: true };
        addMessage(`Opponent fired at (${x}, ${y}): ${result.toUpperCase()}`);
    }
</script>

<main>
    <h1>Battleship</h1>

    {#if phase === "lobby"}
        <div class="lobby">
            <input type="text" bind:value={username} placeholder="Username" />
            <input type="text" bind:value={room_id} placeholder="Room ID" />
            <button onclick={connect} disabled={!username.trim()}>Connect</button>
        </div>
    {:else}
        <div class="status-bar" class:your-turn={isMyTurn} class:gameover={phase === "gameover"}>
            {statusMessage}
        </div>

        <div class="game">
            <div class="board-container">
                <h3>Your Board</h3>
                <div class="board">
                    {#each myBoard as row, y}
                        <div class="row">
                            {#each row as cell, x}
                                <div
                                    title={`(${x}, ${y})`}
                                    class="cell"
                                    class:ship={cell.hasShip && !cell.shot}
                                    class:hit={cell.shot && cell.hasShip}
                                    class:miss={cell.shot && !cell.hasShip}
                                ></div>
                            {/each}
                        </div>
                    {/each}
                </div>
            </div>

            <div class="board-container">
                <h3>Enemy Board</h3>
                <div class="board">
                    {#each enemyBoard as row, y}
                        <div class="row">
                            {#each row as cell, x}
                                <button
                                    title={`(${x}, ${y})`}
                                    class="cell enemy-cell"
                                    class:hit={cell.shot && cell.hasShip}
                                    class:miss={cell.shot && !cell.hasShip}
                                    class:clickable={phase === "playing" && isMyTurn && !cell.shot}
                                    onclick={() => handleEnemyBoardClick(x, y)}
                                    disabled={phase !== "playing" || !isMyTurn || cell.shot}
                                ></button>
                            {/each}
                        </div>
                    {/each}
                </div>
            </div>
        </div>

        <div class="controls">
            {#if phase === "gameover"}
                <button onclick={() => { disconnect(); newGame(); }}>New Game</button>
            {:else}
                <button onclick={disconnect}>Disconnect</button>
            {/if}
        </div>
    {/if}

    <div class="messages">
        <h3>Log</h3>
        <ul>
            {#each messages as msg}
                <li>{msg}</li>
            {/each}
        </ul>
    </div>
</main>
