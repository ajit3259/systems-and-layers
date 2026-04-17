import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import path from "path";
import express from "express";

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

type PutAccountRequest = {
    name: string;
    description: string;
    balance: number;
}

type PatchAccountRequest = {
    description: string;
}

type Amount = {
    value: number;
}

const data: Map<string, Account> = new Map();

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

app.put("/accounts/:id", (req, res) => {
    const putAccountRequest = req.body as PutAccountRequest;

    const fetchedData = data.get(req.params.id);
     if(!fetchedData) {
        res.status(404).send("Not Found");
        return;
    }
    fetchedData.name = putAccountRequest.name;
    fetchedData.description = putAccountRequest.description;
    fetchedData.balance = putAccountRequest.balance || 0;
    data.set(fetchedData.id, fetchedData);
    res.json(fetchedData);
});

app.patch("/accounts/:id", (req, res) => {
    const patchAccountRequest = req.body as PatchAccountRequest;

    const fetchedData = data.get(req.params.id);
     if(!fetchedData) {
        res.status(404).send("Not Found");
        return;
    }
    fetchedData.description = patchAccountRequest.description;
    data.set(fetchedData.id, fetchedData);
    res.json(fetchedData);
});

app.delete("/accounts/:id", (req, res) => {
    const fetchedData = data.get(req.params.id);
     if(!fetchedData) {
        res.status(404).send("Not Found");
        return;
    }
    data.delete(fetchedData.id);
    res.status(204).send();
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
    res.json(fetchedData);
});

app.listen(port, () => {
    console.log(`App started on port ${port}`)
});