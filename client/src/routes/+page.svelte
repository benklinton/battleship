<script lang="ts">
    let username= $state("");
    let room_id = "test-room"
    let messages = $state<string[]>([]);
    let socket: WebSocket | null = null;

    function connect() {
        socket = new WebSocket(`ws://localhost:3001/ws?username=${encodeURIComponent(username)}&room_id=${encodeURIComponent(room_id)}`);

        socket.addEventListener('open', () => {
            messages = [...messages, `Connected to the server as ${username}`];
            socket?.send(`${username} has joined the server`);
        });

        socket.addEventListener('message', (event) => {
            const data = JSON.parse(event.data);
            if (data.type === "message") {
                messages = [...messages, `${data.message}`];
            }
        });

        socket.addEventListener('close', () => {
            messages = [...messages, `${username} has disconnected from server`];
        });
    }

    function disconnect() {
        socket?.send(`${username} has disconnected from server`);
        socket?.close();
        socket = null;

    }


</script>
<input type="text" bind:value={username} placeholder="Enter username" />
<button onclick={connect}>Connect</button>
<button onclick={disconnect}>Disconnect</button>
<ul>
    {#each messages as msg}
        <li>{msg}</li>
    {/each}
</ul>
