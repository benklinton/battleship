type ClientData = {
    username?: string;
    room_id?: string;
};

const server = Bun.serve<ClientData>({
    port: 3001,

    fetch(request, server) {
        const url = new URL(request.url);

        if(url.pathname === "/ws") {
            // Handle WebSocket connection
            const username = url.searchParams.get("username") ?? "Anonymous";
            const room_id = url.searchParams.get("room_id") ?? "default-room";

            const upgraded = server.upgrade(request, {
                data: { username, room_id }
            });

            if(upgraded) return;
            return new Response("WebSocket upgrade failed", { status: 500 });
        }

        return new Response("Bun WebSocket server is running");
        },

        websocket: {
            open(ws) {
                const channel = `room:${ws.data.room_id}`;
                
                ws.subscribe(channel);

                ws.publish(channel, JSON.stringify({
                    type: "system",
                    message: `${ws.data.username} joined the server`
                }));
            },
            message(ws, message) {
                const channel = `room:${ws.data.room_id}`;
                const text = typeof message === "string" ? message : Buffer.from(message).toString();
                console.log(`${ws.data.username}: ${text}`);

                ws.publish(channel, JSON.stringify({
                    type: "message",
                    username: ws.data.username,
                    message: text
                }));
            },
            close(ws) {
                const channel = `room:${ws.data.room_id}`;
                console.log(`${ws.data.username} disconnected`);
                ws.publish(channel, JSON.stringify({
                    type: "close",
                    message: `${ws.data.username} disconnected`
                }));
            }
        }

});
console.log(`WebSocket server is running on ws://localhost:${server.port}/ws`);