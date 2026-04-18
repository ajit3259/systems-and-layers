import mqtt from "mqtt";

const client = mqtt.connect("mqtt://localhost:1883");

const atmHealthTopics = "atm/+/health";

client.on("connect", () => {
    console.log("Bank connected to mqtt broker");

    client.subscribe(atmHealthTopics, { qos: 1 });
});

// kept outside as doesn't want to subscribe multiple handlers
client.on("message", (topic, msg) => {
    console.log(`Recieved message for ${topic}: ${msg}`);
});

client.on("disconnect", () => {
    console.log("Baknk disconeected from mqtt broker");
})