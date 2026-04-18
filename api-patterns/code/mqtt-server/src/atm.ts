import mqtt from "mqtt";

const BROKER_ADDR = "mqtt://localhost:1883";
const ATM_NUM = 10;

type ATM = {
    id: string;
    clientConn: mqtt.MqttClient;
};

// MQTT convention is no leading slash
// The leading slash creates an empty first level which causes wildcard matching issues.
const getATMHealthTopic = (atmId: string) => `atm/${atmId}/health`;

type HealthStatus = "healthy" | "degraded" | "shutting-down";

type HealthMessage = {
    healthStatus: HealthStatus;
    reportedAt: number;
}

const getHealthMessage = () : HealthMessage  => {
    return {
        healthStatus: "healthy",
        reportedAt: Math.floor(Date.now() / 1000),
    };
};

const createATMs = (num: number): ATM[] => {
    const atms: ATM[] = []
    for(let i = 1; i <= num; i++) {
        atms.push({
            id: `ATM-${i.toString()}`,
            clientConn: mqtt.connect(BROKER_ADDR),
        });
    }
    return atms;
}

const atms = createATMs(ATM_NUM);

atms.forEach(atm => {
    let healthTimer: NodeJS.Timeout;

    atm.clientConn.on("connect", () => {
        console.log(`${atm.id} connected`);
        healthTimer = setInterval(
            () => atm.clientConn.publish(getATMHealthTopic(atm.id), JSON.stringify(getHealthMessage()), { qos: 1, retain: true}, (err) => {
                if(err) console.error(`${atm.id} publish failed:`, err.message);
                else console.log(`${atm.id} broker ACK received`);
            }), 
        5000);
    });

    atm.clientConn.on("disconnect", () => {
        console.log(`${atm.id} disconneted`);
        clearInterval(healthTimer);
    });

    atm.clientConn.on("error", (err) => console.log(`${atm.id} error:`, err.message));

    atm.clientConn.on("reconnect", () => console.log(`${atm.id} reconnecting...`));
});
