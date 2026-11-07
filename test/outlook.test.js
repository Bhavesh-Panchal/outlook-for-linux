"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

// product.js pulls in desktop.js, which requires electron; stub it for plain Node.
const realLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "electron") return { dialog: {} };
  return realLoad.call(this, request, ...rest);
};

const { validateProduct, LINK } = require("@ms365-for-linux/core");
const { createLinkClassifier } = require("@ms365-for-linux/core/src/links");
const { parseMailto, composeUrl } = require("../src/mailto");
const { mqttSettings, discoveryMessages, unreadPayload } = require("../src/mqtt");
const descriptor = require("../src/product");

test("descriptor validates and classifies Outlook hosts", () => {
  const product = validateProduct(descriptor);
  const classify = createLinkClassifier(product);
  assert.equal(classify("https://outlook.office.com/mail/inbox"), LINK.APP);
  assert.equal(classify("https://outlook.live.com/mail/0/"), LINK.APP);
  assert.equal(classify("https://login.microsoftonline.com/common/oauth2"), LINK.AUTH);
  assert.equal(classify("https://res.cdn.office.net/x.js"), LINK.CONTENT);
  assert.equal(classify("https://contoso-my.sharepoint.com/personal/x"), LINK.CONTENT);
  assert.equal(classify("mailto:someone@example.com"), LINK.PROTOCOL);
  assert.equal(classify("https://www.example.org/"), LINK.EXTERNAL);
});

test("mailto: parsing (RFC 6068)", () => {
  const m = parseMailto("mailto:a@x.com,b@x.com?cc=c@x.com&subject=Hello%20there&body=Line1%0D%0ALine2&bcc=d@x.com;e@x.com");
  assert.deepEqual(m.to, ["a@x.com", "b@x.com"]);
  assert.deepEqual(m.cc, ["c@x.com"]);
  assert.deepEqual(m.bcc, ["d@x.com", "e@x.com"]);
  assert.equal(m.subject, "Hello there");
  assert.equal(m.body, "Line1\r\nLine2");
});

test("mailto: plus is literal, header injection is flattened, bad escapes survive", () => {
  assert.equal(parseMailto("mailto:a+tag@x.com").to[0], "a+tag@x.com");
  assert.equal(parseMailto("mailto:?subject=Hi%0D%0ABcc:%20evil@x.com").subject, "Hi Bcc: evil@x.com");
  assert.equal(parseMailto("mailto:?subject=100%").subject, "100%");
  assert.deepEqual(parseMailto("MAILTO:").to, []);
  assert.throws(() => parseMailto("https://x"), /Not a mailto/);
});

test("compose URL per account host", () => {
  const fields = parseMailto("mailto:a@x.com?subject=Q%26A");
  assert.equal(
    composeUrl("https://outlook.office.com/mail/", fields),
    "https://outlook.office.com/mail/deeplink/compose?to=a%40x.com&subject=Q%26A",
  );
  assert.equal(composeUrl("https://outlook.live.com/mail/", {}), "https://outlook.live.com/mail/0/deeplink/compose");
});

test("protocol handler output is an app URL", () => {
  const product = validateProduct(descriptor);
  const classify = createLinkClassifier(product);
  const target = product.protocols[0].toUrl("mailto:a@x.com", { startUrl: product.urls.work });
  assert.equal(classify(target), LINK.APP);
});

const flat = (over = {}) => ({
  "mqtt.enabled": true,
  "mqtt.brokerUrl": "mqtt://broker.lan:1883",
  "mqtt.username": null,
  "mqtt.password": null,
  "mqtt.clientId": "outlook-for-linux",
  "mqtt.topicPrefix": "outlook",
  "mqtt.homeAssistant": true,
  "mqtt.discoveryPrefix": "homeassistant",
  ...over,
});

test("MQTT settings validation", () => {
  assert.deepEqual(mqttSettings(flat()).problems, []);
  assert.deepEqual(mqttSettings(flat({ "mqtt.enabled": false, "mqtt.brokerUrl": null })).problems, []);
  const bad = mqttSettings(flat({ "mqtt.brokerUrl": "http://x", "mqtt.topicPrefix": "a/#", "mqtt.clientId": "x y" })).problems;
  assert.equal(bad.length, 3);
});

test("MQTT discovery and payloads", () => {
  const msgs = discoveryMessages(mqttSettings(flat()).settings, "Outlook for Linux");
  assert.equal(msgs.length, 1);
  const [topic, payload, retain] = msgs[0];
  assert.equal(topic, "homeassistant/sensor/outlook-for-linux_unread/config");
  assert.equal(JSON.parse(payload).state_topic, "outlook/unread");
  assert.equal(retain, true);
  assert.deepEqual(discoveryMessages(mqttSettings(flat({ "mqtt.homeAssistant": false })).settings, "x"), []);
  assert.equal(unreadPayload(-1), "0");
  assert.equal(unreadPayload(12), "12");
});
