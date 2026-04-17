import { ChannelCredentials } from "@grpc/grpc-js";
import { promisify } from "util";
import { 
    Account,
    AccountServiceClient,
    CreateAccountRequest, 
    DepositRequest 
} from "./generated/proto/banking.js";

const accountServiceClient: AccountServiceClient = new AccountServiceClient("localhost:50051", ChannelCredentials.createInsecure());

const createAccountRequest: CreateAccountRequest = {
    name: "Ajit",
    description: "Service Account"
};

// create an account
const createAccount = promisify(accountServiceClient.createAccount.bind(accountServiceClient));
let accountId: string;
try {
    const account = await createAccount(createAccountRequest) as Account;
    accountId = account.id;
    console.log(account);
} catch(err) {
    console.error(err);
    process.exit(1);
};


// valid account id case
const getAccount = promisify(accountServiceClient.getAccount.bind(accountServiceClient));
try {
    const account: Account = await getAccount({id: accountId}) as Account;
    console.log(account);
} catch(err) {
    console.log(err);
};


// invalid account id case
try {
    const account: Account = await getAccount({id: "Invalid"}) as Account;
    console.log(account);
} catch(err) {
    console.log(err);
};

const depositRequest: DepositRequest = {
    id: accountId,
    amount: 50,
};

// deposit some amount less than 0
const deposit = promisify(accountServiceClient.deposit.bind(accountServiceClient));
try {
    const account: Account = await deposit({...depositRequest, amount: -2}) as Account;
    console.log(account);
} catch(err) {
    console.log(err);
};

// deposit amount valid
try {
    const account: Account = await deposit(depositRequest) as Account;
    console.log(account);
} catch(err) {
    console.log(err);
};

// watch balance
const stream = accountServiceClient.watchBalance({id: accountId});
stream.on("data", (update) => console.log("Balance:", update.balance));
stream.on("error", (err) => console.error(err));


// set interval to verify stream 
setInterval(() => deposit(depositRequest), 10000);