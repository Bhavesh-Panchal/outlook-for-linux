"use strict";

// Optional: publish the unread mail count to an MQTT broker, with Home
// Assistant discovery. Off by default (mqtt.enabled). Modelled on
// teams-for-linux app/mqtt (GPL-3.0-or-later). Broker URL, user names and
// topics are never logged.

const MQTT_OPTIONS = Object.freeze({
  "mqtt.enabled": { type: "boolean", default: false, describe: "Publish the unread count to an MQTT broker" },
  "mqtt.brokerUrl": { type: "string", default: null, sensitive: true, describe: "Broker URL, e.g. mqtt://host:1883 or mqtts://host:8883" },
  "mqtt.username": { type: "string", default: null, sensitive: true, describe: "Broker user name" },
  "mqtt.password": { type: "string", default: null, sensitive: true, describe: "Broker password (stored in plain text in the config file)" },
  "mqtt.clientId": { type: "string", default: "outlook-for-linux", describe: "MQTT client id; also names the Home Assistant entity" },
  "mqtt.topicPrefix": { type: "string", default: "outlook", describe: "Topic prefix: <prefix>/unread and <prefix>/connected" },
  "mqtt.homeAssistant": { type: "boolean", default: false, describe: "Publish Home Assistant MQTT discovery config" },
  "mqtt.discoveryPrefix": { type: "string", default: "homeassistant", describe: "Home Assistant discovery prefix" },
});

const TOPIC_SEGMENT = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/;

function mqttSettings(flat) {
  const s = {
    enabled: flat["mqtt.enabled"],
    brokerUrl: flat["mqtt.brokerUrl"],
    username: flat["mqtt.username"],
    password: flat["mqtt.password"],
    clientId: flat["mqtt.clientId"],
    prefix: flat["mqtt.topicPrefix"],
    homeAssistant: flat["mqtt.homeAssistant"],
    discoveryPrefix: flat["mqtt.discoveryPrefix"],
  };
  const problems = [];
  if (s.enabled) {
    let protocol = null;
    try {
      protocol = new URL(s.brokerUrl ?? "").protocol;
    } catch {
      // reported below
    }
    if (!["mqtt:", "mqtts:", "ws:", "wss:"].includes(protocol)) problems.push("mqtt.brokerUrl must be an mqtt://, mqtts://, ws:// or wss:// URL");
    if (!TOPIC_SEGMENT.test(s.prefix)) problems.push("mqtt.topicPrefix may contain only letters, digits, _ - and /");
    if (!TOPIC_SEGMENT.test(s.discoveryPrefix)) problems.push("mqtt.discoveryPrefix may contain only letters, digits, _ - and /");
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(s.clientId)) problems.push("mqtt.clientId may contain only letters, digits, _ and - (max 64)");
  }
  return { settings: s, problems };
}

/** Messages to publish, as [topic, payload, retain] tuples. Pure, for tests. */
function discoveryMessages(s, productName) {
  if (!s.homeAssistant) return [];
  const id = `${s.clientId}_unread`;
  return [
    [
      `${s.discoveryPrefix}/sensor/${id}/config`,
      JSON.stringify({
        name: "Unread mail",
        unique_id: id,
        state_topic: `${s.prefix}/unread`,
        availability_topic: `${s.prefix}/connected`,
        payload_available: "true",
        payload_not_available: "false",
        icon: "mdi:email",
        state_class: "measurement",
        device: { identifiers: [s.clientId], name: productName, manufacturer: "ms365-for-linux" },
      }),
      true,
    ],
  ];
}

function unreadPayload(count) {
  return String(Math.max(count, 0));
}

function startMqtt(ctx, onUnread) {
  const { settings: s, problems } = mqttSettings(ctx.flat);
  if (!s.enabled) return null;
  if (problems.length > 0) {
    for (const p of problems) ctx.logger.warn(`[MQTT] ${p}; MQTT disabled`);
    return null;
  }
  let mqtt;
  try {
    mqtt = require("mqtt");
  } catch {
    ctx.logger.warn("[MQTT] The mqtt module is not installed; MQTT disabled");
    return null;
  }
  const connectedTopic = `${s.prefix}/connected`;
  const client = mqtt.connect(s.brokerUrl, {
    clientId: s.clientId,
    username: s.username ?? undefined,
    password: s.password ?? undefined,
    reconnectPeriod: 10000,
    will: { topic: connectedTopic, payload: "false", retain: true, qos: 1 },
  });
  let last = 0;
  const publish = (topic, payload, retain) => {
    if (client.connected) client.publish(topic, payload, { retain, qos: 1 });
  };
  client.on("connect", () => {
    ctx.logger.info("[MQTT] Connected");
    publish(connectedTopic, "true", true);
    for (const [topic, payload, retain] of discoveryMessages(s, ctx.product.name)) publish(topic, payload, retain);
    publish(`${s.prefix}/unread`, unreadPayload(last), true);
  });
  client.on("error", (error) => ctx.logger.warn("[MQTT] Connection error", { code: error.code ?? "unknown" }));
  onUnread((count) => {
    last = count;
    publish(`${s.prefix}/unread`, unreadPayload(count), true);
  });
  ctx.app.on("before-quit", () => {
    publish(connectedTopic, "false", true);
    client.end(false);
  });
  return client;
}

module.exports = { MQTT_OPTIONS, mqttSettings, discoveryMessages, unreadPayload, startMqtt };
