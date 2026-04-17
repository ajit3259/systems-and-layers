import { Server, status, ServerCredentials, ServerWritableStream } from "@grpc/grpc-js";
import { 
    Account, 
    AccountRequest, 
    AccountServiceServer, 
    AccountServiceService, 
    BalanceUpdate, 
    CreateAccountRequest, 
    DepositRequest 
} from "./generated/proto/banking.js";
import { randomUUID } from "crypto";

const server = new Server();
server.bindAsync("0.0.0.0:50051", ServerCredentials.createInsecure(), () => {
    console.log("gRPC server running on port 50051");
});

const data: Map<string, Account> = new Map();
const activeStreams: Map<string, ServerWritableStream<AccountRequest, BalanceUpdate>[]> = new Map();

const accountServiceServer: AccountServiceServer = {
    createAccount: (call, callback) => {
        const req: CreateAccountRequest = call.request;
        const accountId = randomUUID();
        const account: Account = {
            id: accountId,
            name: req.name,
            description: req.description,
            balance: 0
        };
        data.set(accountId, account);
        callback(null, account);
    },

    getAccount: (call, callback) => {
        const req: AccountRequest = call.request;
        const account: Account | undefined = data.get(req.id);
        if(!account) {
            callback({code: status.NOT_FOUND, message: "Account not found"}, null);
            return;
        }
        callback(null, account);
    },

    deposit: (call, callback) => {
        const req: DepositRequest = call.request;
        const account: Account | undefined = data.get(req.id);
        if(!account) {
            callback({code: status.NOT_FOUND, message: "Account not found"}, null);
            return;
        }
        if(req.amount <= 0) {
            callback({code: status.INVALID_ARGUMENT, message: "Deposit must be greater than O"}, null);
            return;
        }
        account.balance = account.balance + req.amount;
        data.set(account.id, account);
        // notify all the active strems
        const streams = activeStreams.get(account.id);
        if(streams) {
            const balanceUpdate: BalanceUpdate = {
                id: account.id,
                balance: account.balance,
            };
            streams.forEach(stream => stream.write(balanceUpdate));
        }
        callback(null, account);
    },

    watchBalance: (call) => {
        const req: AccountRequest = call.request;
        const account: Account | undefined = data.get(req.id);
        if(!account) {
            call.destroy(Object.assign(new Error("Account not found"), { code: status.NOT_FOUND }));
            return;
        }
        const balanceUpdate: BalanceUpdate = {
            id: account.id,
            balance: account.balance,
        };

        // register stream
        const streams = activeStreams.get(req.id);
        if(streams) {
            streams.push(call);
        } else {
            activeStreams.set(req.id, [call]);
        }

        // send initial update
        call.write(balanceUpdate);

        call.on("close", () => {
            const streams = activeStreams.get(req.id);
            if(streams) {
                const remaining = streams.filter(s => s !== call);
                remaining.length === 0
                    ? activeStreams.delete(req.id)
                    : activeStreams.set(req.id, remaining);
            }
        });
    },
};

server.addService(AccountServiceService, accountServiceServer);
