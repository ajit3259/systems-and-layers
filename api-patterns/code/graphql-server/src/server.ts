import { ApolloServer } from "@apollo/server";
import { ApolloServerPluginLandingPageDisabled } from "@apollo/server/plugin/disabled";
import { expressMiddleware } from "@apollo/server/express4";
import express from "express";
import { createServer } from "http";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/use/ws";
import { PubSub } from "graphql-subscriptions";
import { randomUUID } from "crypto";
import DataLoader from "dataloader";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pubsub = new PubSub();

const app = express();
const port = 4000;
const typeDefs = readFileSync("./schema/banking.graphql", "utf-8");

// in-memory datastore
type Account = {
    id: string;
    description: string;
    balance: number;
};

type User = {
    id: string;
    name: string;
    age: number;
    address: string;
};

// defining these inputs but can be generated from SDL with graphql-codegen
type CreateUserInput = {
    name: string;
    age: number;
    address: string;
};

type CreateAccountInput = {
    userId: string;
    description: string;
};

type DepositInput = {
    userId: string;
    accountId: string;
    amount: number;
};

// Mirrornig a real database with separate tables, joined by ID. 
// The resolver will take acre of the "join" explicitly, which is where N+1 becomes visible.
const users: Map<string, User> = new Map();
const accounts: Map<string, Account> = new Map();
const userAccounts: Map<string, string[]> = new Map();

// using data loaders for account
const accountDataLoader = new DataLoader(async (userIds: readonly string[]) => {
    // this is called once with all userIds collected in this tick
    // return result in same order as userIds
    const userAccountData: Map<string, Account[]> = new Map();

    console.log(`DataLoader batch called with ${userIds.length} userIds`);

    // use of as in will give indices
    for (const userId of userIds) {
        const accountIds = userAccounts.get(userId) ?? [];
        userAccountData.set(userId, accountIds.map(id => accounts.get(id)!));
    }

    return userIds.map(id => userAccountData.get(id) ?? []);
});

const resolvers = {
    Query: {
        user: (_: unknown, args: { userId: string }) => {
            if(!users.has(args.userId)) {
                throw new Error("user doesn't exist");
            }
            return users.get(args.userId);
        },
        users: () => {
            return users.values().toArray();
        },
        account: (_: unknown, args: { userId: string, accountId: string}) => {
            if(!users.has(args.userId)) {
                throw new Error("user doesn't exist");
            }
            const userAccountIds = userAccounts.get(args.userId) ?? []; 
            if (!userAccountIds.includes(args.accountId)) {
                throw new Error("account doesn't exist");
            }
            return accounts.get(args.accountId);
        },
        accounts: (_: unknown, args: { userId: string}) => {
            if(!users.has(args.userId)) {
                throw new Error("user doesn't exist");
            }
            const userAccountList = (userAccounts.get(args.userId) ?? []).map(id => accounts.get(id)!);
            return userAccountList;
        }
    },
    Mutation: {
        createUser: (_: unknown, args: { input: CreateUserInput }) => {
            const userId = randomUUID();
            const user: User = { id: userId, ...args.input };
            users.set(userId, user);
            return user;
        },
        createAccount: (_: unknown, args: { input: CreateAccountInput }) => {
            const userId = args.input.userId;
            if(!users.has(userId)) {
                throw new Error("User does not exists");
            }

            const accountId = randomUUID();
            const account: Account = { id: accountId, balance: 0, description: args.input.description };
            accounts.set(accountId, account);

            userAccounts.set(userId, userAccounts.get(userId) ?? []);
            userAccounts.get(userId)!.push(account.id);
            return account;
        },
        deposit: (_: unknown, args: { input: DepositInput }) => {
            const userId = args.input.userId;
            if(!users.has(userId)) {
                throw new Error("User does not exists");
            }

            const accountId = args.input.accountId;
            if(!accounts.has(accountId)) {
                throw new Error("Account does not exists");
            }

            if(args.input.amount <= 0) {
                throw new Error("Amount must be greater than 0");
            }

            const userAccountIds = userAccounts.get(userId) ?? [];
            if (!userAccountIds.includes(accountId)) {
                throw new Error("account doesn't exist");
            }

            const account = accounts.get(accountId)!;
            account.balance = account.balance + args.input.amount;
            accounts.set(accountId, account);
            pubsub.publish(`BALANCE_UPDATED_${userId}_${accountId}`, { balanceUpdated: account });
            return account;
        },
    },
    Subscription: {
        balanceUpdated: {
            subscribe: (_: unknown, args: { userId: string, accountId: string }) =>
                pubsub.asyncIterableIterator(`BALANCE_UPDATED_${args.userId}_${args.accountId}`),
        }
    },
    User: {
        accounts: (parent: User) => {
            return accountDataLoader.load(parent.id);
        }
    },
};

// const apolloServer = new ApolloServer({ typeDefs, resolvers });
// const { url } = await startStandaloneServer(apolloServer, { listen: { port: 4000} });


// makeExecutableSchema combines typeDefs + resolvers into a single executable schema object.
// It is the same thing Apollo was doing internally
const schema = makeExecutableSchema({ typeDefs, resolvers });

// replace startStandaloneServer with a manual HTTP server setup that handles both 
// HTTP (queries/mutations) and WebSocket (subscriptions) on the same port.
// schema explicitly so we can pass it to both Apollo (for HTTP) and graphql-ws (for WebSocket)
const httpServer = createServer(app); // using express to handle query and mutations 
const apolloServer = new ApolloServer({ schema , plugins: [ApolloServerPluginLandingPageDisabled()]});
await apolloServer.start();
const wsServer = new WebSocketServer({ server: httpServer, path: "/graphql" });

app.use(express.json());
app.use("/graphql", expressMiddleware(apolloServer));
app.use(express.static(path.join(__dirname, "../")));

useServer({ schema }, wsServer);
httpServer.listen(port);
console.log(`Server is running at ${JSON.stringify(httpServer.address())}`);