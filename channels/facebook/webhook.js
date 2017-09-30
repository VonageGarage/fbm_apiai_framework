// code was inspired from https://github.com/fbsamples/messenger-platform-samples

module.exports = {};
require('log-timestamp');

const utility = require('./utility');
const sessionsManager = require('../../sessionsManager');


var sendMessageToUser = function (message, sessionId) {
  let session = sessionsManager.getSessionBySessionId(sessionId);
  console.log("MESSAGE: ", message);

  switch (message.type) {
    case sessionsManager.MESSAGE_TYPES.CUSTOME:
      utility.sendCustomMessage(session.userId, message.payload.facebook);
      break;
    case sessionsManager.MESSAGE_TYPES.TEXT:
      utility.sendTextMessage(session.userId, message.speech || message.text);
      break;
    case sessionsManager.MESSAGE_TYPES.CARD:
      utility.sendGenericMessage(session.userId, message.title, message.subtitle, message.imageUrl, message.buttons);
      break;
    case sessionsManager.MESSAGE_TYPES.QUICK_REPLY:
      utility.sendQuickReply(session.userId, message.title, message.replies);
      break;
    case sessionsManager.MESSAGE_TYPES.IMAGE:
      utility.sendImageMessage(session.userId, message.payload);
      break;
    case sessionsManager.MESSAGE_TYPES.AUDIO:
      utility.sendAudioMessage(session.userId, message.payload);
      break;
    case sessionsManager.MESSAGE_TYPES.VIDEO:
      utility.sendVideoMessage(session.userId, message.payload);
      break;
  }
};

var handleInboundEvent = function (req, res, next) {
  if (req.method == 'GET') {
    utility.verifySubscription(req, res)
  }
  else if (req.method === 'POST') {
    handlePostRequest(req, res)
  }
}

/*
 * All callbacks for Messenger are POST-ed. They will be sent to the same
 * webhook. Be sure to subscribe your app to your page to receive callbacks
 * for your page. 
 * https://developers.facebook.com/docs/messenger-platform/product-overview/setup#subscribe_app
 *
 */
const handlePostRequest = (req, res) => {
  var data = req.body;
  try {
    // Make sure this is a page subscription
    if (data && data.object && data.object == 'page') {
      // Iterate over each entry
      // There may be multiple if batched
      data.entry.forEach(function (pageEntry) {
        var pageID = pageEntry.id;
        var timeOfEvent = pageEntry.time;

        // Iterate over each messaging event
        pageEntry.messaging.forEach(function (messagingEvent) {
          if (messagingEvent.optin) {
            receivedAuthentication(messagingEvent);
          } else if (messagingEvent.message) {
            receivedMessage(messagingEvent);
          } else if (messagingEvent.delivery) {
            utility.receivedDeliveryConfirmation(messagingEvent);
          } else if (messagingEvent.postback) {
            receivedPostback(messagingEvent);
          } else if (messagingEvent.read) {
            utility.receivedMessageRead(messagingEvent);
          } else if (messagingEvent.account_linking) {
            receivedAccountLink(messagingEvent);
          } else {
            console.log("Webhook received unknown messagingEvent: ", messagingEvent);
          }
        });
      });
    }
  }
  catch (e) {
    console.log("INSIDE CATCH KA", e)
  }
  // Assume all went well.
  //
  // You must send back a 200, within 20 seconds, to let us know you've 
  // successfully received the callback. Otherwise, the request will time out.
  res.sendStatus(200);
};

const receivedMessage = (messagingEvent) => {
  if (messagingEvent.message.is_echo) {
    console.log("Messageing Evnent Echo: ", messagingEvent);
    return;
  }
  if (messagingEvent.message.text) {
    console.log('facebook.webhook.receivedMessage. incoming text message: ' + messagingEvent.message.text + ". From " + messagingEvent.sender.id);
    let inboundMessage = {
      from: messagingEvent.sender.id,
      to: messagingEvent.recipient.id,
      text: messagingEvent.message.text,
      quick_reply: messagingEvent.message.quick_reply
    };

    sessionsManager.handleInboundChannelMessage(inboundMessage);
  }
  else if (messagingEvent.message.attachments) {
    console.log("facebook.webhook.receivedMessage. incoming attachments");
    messagingEvent.message.attachments.forEach(function (attachment) {
      switch (attachment.type) {
        default:
          console.log("facebook.webhook.receivedMessage. attachment " + attachment.type + " unhandled");
          break;
      }
    })
  }
}

/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message. 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 * 
 */
const receivedPostback = (messagingEvent) => {
  let payload = "";
  try {
    payload = JSON.parse(messagingEvent.postback.payload)
  } catch (e) {
    payload = { type: messagingEvent.postback.payload };
  };

  let inboundPostbackMessage =

    {
      from: messagingEvent.sender.id,
      to: messagingEvent.recipient.id,
      payload: payload
    };

  /// TODO: promisfy this to send the 200 response back as quickly as possible
  sessionsManager.handleInboundChannelPostback(inboundPostbackMessage);
}

/*
 * Account Link Event
 *
 * This event is called when the Link Account or UnLink Account action has been
 * tapped.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/account-linking
 * 
 */
const receivedAccountLink = (event) => {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;

  var status = event.account_linking.status;
  var authCode = event.account_linking.authorization_code.substring("MY_AUTHORIZATION_CODE_".length);

  console.log("Received account link event with for user %d with status %s " +
    "and auth code %s ", senderID, status, authCode);
  sessionsManager.getSessionByChannelEvent({from: senderID })
  .then(session => {
    sendMessageToUser({text: "Yay! your auth code is " + authCode, type: sessionsManager.MESSAGE_TYPES.TEXT}, session.sessionId )
  })
}

module.exports.handleInboundEvent = handleInboundEvent;
module.exports.sendMessageToUser = sendMessageToUser;
