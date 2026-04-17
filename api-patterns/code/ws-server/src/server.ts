import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import path from "path";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express()
app.use(express.static(path.join(__dirname, "../")))
const port = 3000

const server = http.createServer(app)
const wss = new WebSocketServer({ server });

const agentResponses = [
    "How can I help you today?",
    "Let me look into that for you.",
    "Your issue has been resolved."
]

type Message = {
    msgType: "chat" | "identity";
    role: "customer" | "agent";
    from: string;
    to?: string;
    text: string;
}

// Agent class to handle reply to customer request
class Agent {
    private id: string;
    private responseIndex: number;

    constructor(id: string) {
        this.id = id;
        this.responseIndex = 0;
    }
    
    public get identifier() : string {
        return this.id
    }

    public getResponse() : Message {
        const response: Message = {
            msgType: "chat",
            role: "agent",
            from: "agent",
            text: agentResponses[this.responseIndex] || "Unable to process message ;(",
        };
        this.responseIndex = (this.responseIndex + 1) % agentResponses.length;
        return response;
    }
}

const wsConnections: Map<string, WebSocket> = new Map();
const clientToAgent: Map<string, Agent> = new Map();

wss.on("connection", (ws) => {
    let clientId: string | null = null;  // accessible by all handlers
    ws.on("message", (data) => {
        const message: Message = JSON.parse(data.toString());
        if(message.msgType === 'identity') {
            // create a new client id
            clientId = randomUUID();
            // create a dedicated agent instance
            const agent = new Agent(randomUUID());
            wsConnections.set(clientId, ws);
            clientToAgent.set(clientId, agent);
            const response = agent.getResponse();
            ws.send(JSON.stringify(response));
        } else {
            const failureMessage: Message = {
                msgType: "chat",
                role: "agent",
                from: "agent",
                text: "Unexpected error occurred!!!"
            };

            if(!clientId) {
                ws.send(JSON.stringify(failureMessage));
                return;
            }

            // ideally not having agent and ws should not happen
            const agent = clientToAgent.get(clientId!);
            if(!agent) {
                ws.send(JSON.stringify(failureMessage));
                return;
            }

            const existingWsConn = wsConnections.get(clientId!);
            if(!existingWsConn) {
                ws.send(JSON.stringify(failureMessage));
                return;
            }

            const response = agent.getResponse();
            existingWsConn.send(JSON.stringify(response));
        }
    });

    ws.on("close", () => {
        if (clientId) {
            wsConnections.delete(clientId);
            clientToAgent.delete(clientId);
        }
    });
});

server.listen(port);