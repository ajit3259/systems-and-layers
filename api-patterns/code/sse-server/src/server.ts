import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import path from "path";
import express from "express";
import type { Response } from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express()
const port = 3000

app.use(express.json())
app.use(express.static(path.join(__dirname, "../")))

type Account = {
    id: string;
    name: string;
    description: string;
    balance: number;
}

type CreateAccountRequest = {
    name: string;
    description: string;
}

type Amount = {
    value: number;
}

// in-memory account data store
const data: Map<string, Account> = new Map();

// map to store all active sse connections
const activeSseConnections: Map<string, Response[]> = new Map();

function notifyActiveConnections(responses: Response[], balance: number) {
    responses.forEach(res => res.write(`data: ${JSON.stringify({ "balance": balance })}\n\n`));
}

// ------- Inherited from rest server ------- //
// Create a account and do a simulation over it to deposit and withdraw
// each update sends server side events
app.get("/accounts/:id", (req, res) => {
    const id = req.params.id;
    if(!data.has(id)) {
        res.status(404).send("Not Found");
        return;
    }
    res.json(data.get(id))
});

app.post("/accounts", (req, res) => {
    const createAccountRequest = req.body as CreateAccountRequest;
    const generatedId = randomUUID()
    
    // assuming no collison otherwise we can check
    data.set(generatedId, {
        id: generatedId,
        name: createAccountRequest.name,
        description: createAccountRequest.description,
        balance: 0
    });
    res.status(201).json({id: generatedId});
});

app.post("/accounts/:id/deposit", (req, res) => {
    const amount = req.body as Amount;

    if(amount.value <= 0) {
        res.status(400).send("cannot deposit empty or negative balance");
        return;
    }

    const fetchedData = data.get(req.params.id);
    if(!fetchedData) {
        res.status(404).send("Not Found");
        return;
    }
    
    fetchedData.balance = fetchedData.balance + amount.value;
    data.set(fetchedData.id, fetchedData);
    // before closing notify avtive sse clients
    notifyActiveConnections(activeSseConnections.get(fetchedData.id) || [], fetchedData.balance);
    res.json(fetchedData);
});

app.post("/accounts/:id/withdraw", (req, res) => {
    const amount = req.body as Amount;

    if(amount.value <= 0) {
        res.status(400).send("cannot withdraw empty or negative balance");
        return;
    }

    const fetchedData = data.get(req.params.id);
    if(!fetchedData) {
        res.status(404).send("Not Found");
        return;
    }

    if(amount.value > fetchedData.balance) {
        res.status(400).send("insufficient balance");
        return;
    }
    
    fetchedData.balance = fetchedData.balance - amount.value;
    data.set(fetchedData.id, fetchedData);
    // before closing notify avtive sse clients
    notifyActiveConnections(activeSseConnections.get(fetchedData.id) || [], fetchedData.balance);
    res.json(fetchedData);
});
// --------------------------------------------- //



// ------ API for server side events (SSE) ----- //
app.get("/accounts/:id/balance", (req, res) => {
    const accountId = req.params.id;

    if(!data.has(accountId)) {
        res.status(404).send("Not Found");
        return;
    }

    // closing listner
    req.on("close", () => {
        const conns = activeSseConnections.get(accountId);
        if (conns) {
          const remaining = conns.filter(c => c !== res);
          remaining.length === 0
              ? activeSseConnections.delete(accountId)
              : activeSseConnections.set(accountId, remaining);
        }
    });

    const currentConn = activeSseConnections.get(accountId);

    if(!currentConn) {
        const responses = [res];
        activeSseConnections.set(accountId, responses);
    } else {
        currentConn.push(res); // concat doesn't mutate
    }

    // return the current balance
    const account = data.get(accountId);

    // res.json() closes the connection. so does any call to res.send() or res.end();
    // for SSE we never call these instead we need to set different headers
    res.setHeader("Content-Type", "text/event-stream");

    // no-cache tells every intermediary: don't buffer, 
    // don't cache, pass each chunk through immediately as it arrives. 
    // Without it events might arrive in batches or not at all depending on the infrastructure between client and server.
    res.setHeader("Cache-Control", "no-cache"); 

    res.flushHeaders(); // sends headers, keeps connection open
    
    // send the body using write
    res.write(`data: ${JSON.stringify({ "balance": account!.balance })}\n\n`);
});
// --------------------------------------------- //


app.listen(port, () => {
    console.log(`App started on port ${port}`)
});