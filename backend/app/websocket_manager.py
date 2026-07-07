import json
import asyncio
from typing import List
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        text_data = json.dumps(message)
        for connection in list(self.active_connections):
            try:
                await connection.send_text(text_data)
            except Exception:
                self.disconnect(connection)

    def broadcast_sync(self, message: dict, loop: asyncio.AbstractEventLoop | None = None):
        """Schedule broadcast from a worker thread (FFmpeg / thread pool)."""
        if loop is None:
            return
        if loop.is_running():
            asyncio.run_coroutine_threadsafe(self.broadcast(message), loop)


manager = ConnectionManager()
