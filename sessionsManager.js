module.exports = {}

const actionsManager = require("./actions/manager")

const moment = require("moment")

const structjson = require('./structjson.js')

const EVENTS = {
	GET_STARTED_PAYLOAD: "GET_STARTED_PAYLOAD",
	ACCOUNT_LINKED: "ACCOUNT_LINKED"
}
var sessionsDb
var tokensDb

module.exports.EVENTS = EVENTS

require("log-timestamp")
const uuidv4 = require("uuid/v4")

const MESSAGE_TYPES = {
	TEXT: 0,
	IMAGE: 3,
	CARD: 1,
	QUICK_REPLY: 2,
	CUSTOME: 4,
	AUDIO: 5,
	VIDEO: 6,
	CAROUSEL: 7
}

const CHANNELS = {
	FB_MESSENGER: "FB_MESSENGER",
	FB_WORKPLACE: "FB_WORKPLACE",
	NEXMO: "Nexmo"
}

const SOURCE_TYPE = {
	POST: "POST",
	GROUP_CHAT: "GROUP_CHAT",
	ONE_ON_ONE_CHAT: "ONE_ON_ONE_CHAT"
}

const apiaiModule  = require("./apiai")
var channels = {}

/// TODO clean sessions that were not active for a certain duration
var chatSessions = {}
var userChannelToSessions = {} // channels/integrations from user are pointing to chat sessions
var SessionsDbClass = require("./DB/sessionsDB")
var TokensDbClass = require("./DB/tokenDB")

const getAllActiveSessions = () => {
	// console.log("userChannelToSessions", userChannelToSessions);
	// console.log("chatSessions", chatSessions);
	sessionsDb.getAllActiveSessions()
		.then(activeSessions => {
			for ( const sessionID in activeSessions) {
				let session = activeSessions[sessionID]
			
				// Firebase don't save empty arrays/objects so we create them here if needed
				if ( !session.profile ) { session.profile = {} }
				if ( !session.data ) { session.data = {} }
				if ( !session.apiaiContexts ) { session.apiaiContexts = [] }
			
				chatSessions[sessionID] = session
				userChannelToSessions[session.source] = session
			}
			// console.log("chatSessions", chatSessions);
			// console.log("userChannelToSessions", userChannelToSessions);

		})
		.catch(error => {
			console.error("sessionsManager.getAllActiveSessions caught an error: " + error)
		})
}

const setDB = (db) => {
	sessionsDb = new SessionsDbClass(db)
	tokensDb = new TokensDbClass(db)
	getAllActiveSessions()
}

const getDB = () => {
	return sessionsDb
}

const updateSession = (session, newPropertiesObj) => {
	Object.assign(session, newPropertiesObj)
	sessionsDb.updateSession(session.sessionId, newPropertiesObj)
}

const setChannel = (channelType, channel, apiaiToken) => {
	channels[channelType] = {
		channel: channel,
		apiaiAgent: apiaiModule.getAgent(apiaiToken)
	}
	channel.startChannel()
}

const getChannel = (channelType) => {
	return channels[channelType].channel
}

const getApiAiAgent = (channelType) => {
	return channels[channelType].apiaiAgent
}

const inboundFacebookMessengerEvent = (req, res) => {
	getChannel(CHANNELS.FB_MESSENGER).handleInboundEvent(req, res)
}

const inboundFacebookWorkplaceEvent = (req, res) => {
	getChannel(CHANNELS.FB_WORKPLACE).handleInboundEvent(req, res)
}

const inboundNexmoEvent = (req, res) => {
	getChannel(CHANNELS.NEXMO).handleInboundEvent(req, res)
}

const inboundFacebookWorkplaceInstallEvent = (req, res) => {
	return getChannel(CHANNELS.FB_WORKPLACE).handleInboundInstallEvent(req, res)
}

const inboundFacebookWorkplaceUninstallEvent = (req, res) => {
	return getChannel(CHANNELS.FB_WORKPLACE).handleInboundUninstallEvent(req, res)
}

const getSessionBySessionId = sessionId => {
	return chatSessions[sessionId]
}

const clearChatSessions = (communityId) => {
	console.log("**Removing chat sessions for community", communityId)


	sessionsDb.removeSessionsByCommunity(communityId)
	.then(() => {
		return tokensDb.removeAccessToken(communityId)
	}).then(() => {

		//remove sessions from userChannelToSessions/chatSessions 
		//when app is un-installed 
		for (const session in userChannelToSessions) {
			if (userChannelToSessions[session].community == communityId) {
				console.log("removing session from  userChannelToSessions")
				delete userChannelToSessions[session]
			}
		}
	
		for (const session in chatSessions) {
			if (chatSessions[session].community == communityId) {
				console.log("removing session from chatSessions")
				delete chatSessions[session]
			}
		}
		
		getAllActiveSessions()
	})

}

/*
 * Return new or existing chat session Object.
 * 
 * Chat sessions are mapped by session ID. Since more than one
 *   channel can be mapped to a session, we use userChannelToSessions 
 *   which is mapped by sender ID of the channel (msisdn for SMS, 
 *   pageID for Facebook).
 * To add a new channel to an existing session, an empty channel
 *   object for that channel should aleady have been created in 
 *   the session and userChannelToSessions[sender] is pointing 
 *   to the existing session.
 */
var getSessionByChannelEvent = (messagingEvent) => {
	return new Promise( (resolve, reject) => {
		console.log("getSessionByChannelEvent messagingEvent", messagingEvent)
		console.log("getSessionByChannelEvent looking for source: %s.", messagingEvent.source)
		let mappedChatSession = userChannelToSessions[messagingEvent.source]
		console.log("mappedChatSession ", mappedChatSession)
		// if (process.env.WP_PRODUCTION && mappedChatSession != null && (typeof mappedChatSession.communityAccessToken == "undefined")) {
		// 	console.error("mappedChatSession does not contain communityAccessToken")
		// 	removeSessionBySource(messagingEvent.source)
		// 	mappedChatSession = null
		// 	return reject(new Error("No communityAccessToken"))
		// }
		
		if (mappedChatSession) {
			console.log("getSessionByChannelEvent found source: %s.",  messagingEvent.source)
			mappedChatSession.lastInboundMessage = moment().format("MMMM Do YYYY, h:mm:ss a")
			
			if ( messagingEvent.from ) {
				mappedChatSession.from = messagingEvent.from 
			}
			if ( messagingEvent.profile ) {
				mappedChatSession.profile = messagingEvent.profile 
			}
			if ( messagingEvent.data ) {
				let mergedData = Object.assign(mappedChatSession.data, messagingEvent.data)
				mappedChatSession.data = mergedData
			}
			//TODO: do we need to check for profile as well??
			if (process.env.WP_PRODUCTION && (typeof mappedChatSession.communityAccessToken == "undefined")) {
				//need to verify that community id exists
				//either in the session or from the Message Event
				//If they neither has it, bail
				console.log("mappedChatSession.communityAccessToken does not exist");

				var communityId = mappedChatSession.community
				if  (typeof messagingEvent.community != "undefined") {
					communityId = messagingEvent.community
				}

				if (communityId == null) {
					//no community ID found
					//we cant do anything a
					//TODO: find way to prompt user
					console.error("No Community Id")
					return reject(new Error("No Community Id"))
				}

				console.log("Got CommunityId", communityId)
				tokensDb.getAccessToken(communityId)
				.then(json => {
					if (json) {
						access_token = json.access_token
						console.log("USING communityAccessToken", access_token)
						mappedChatSession.communityAccessToken = json.access_token
					} else {
						console.error("Could not get communityAccessToken")
						return reject(new Error("Could not get communityAccessToken"))
					}
					
					userChannelToSessions[messagingEvent.source] = mappedChatSession
					return getChannel(mappedChatSession.channelType).getUserProfile(mappedChatSession.from, access_token)
				})
				.then(json => {
					console.log("Added profile to existing mappedChatSession")
					console.log("'from' profile:" + JSON.stringify(json))
					mappedChatSession.profile = json
					return sessionsDb.saveSession(mappedChatSession)
				}).then(() => {
					return resolve(mappedChatSession)
				})

			} else {
				sessionsDb.saveSession(mappedChatSession)
				.then(() => {
					return resolve(mappedChatSession)
				})
			}
			
		}
		else {
			// Set new session 
			console.log("getSessionByChannelEvent did not found source: %s.", messagingEvent.source)
			let sessionId = uuidv4()

			mappedChatSession = chatSessions[sessionId] = {
				channelType: messagingEvent.channel,
				sessionId: sessionId,
				profile: {},
				sourceType: messagingEvent.sourceType || null,
				source: messagingEvent.source || null, 
				from: messagingEvent.from || messagingEvent.source,
				lastInboundMessage: moment().format("MMMM Do YYYY, h:mm:ss a"),
				externalIntegrations: {},
				data: messagingEvent.data || {},
				apiaiContexts: []
			}

			if (messagingEvent.community ) {
				mappedChatSession.community = String(messagingEvent.community)
			}
			console.log("messagingEvent.community", messagingEvent.community)

			var communityId = (typeof messagingEvent.community != "undefined") ? messagingEvent.community : null 
			console.log("getSessionByChannelEvent communityId:", communityId);
			tokensDb.getAccessToken(communityId)
			.then(json => {
				var access_token = process.env.WORKPLACE_PAGE_ACCESS_TOKEN
				if (json) {
					access_token = json.access_token
					console.log("USING communityAccessToken", access_token)
					mappedChatSession.communityAccessToken = json.access_token
				} else {
					if (process.env.WP_PRODUCTION) {
						console.error("Could not get communityAccessToken")
						return reject(new Error("Could not get communityAccessToken"))
					}
				}
				userChannelToSessions[messagingEvent.source] = mappedChatSession
				return getChannel(mappedChatSession.channelType).getUserProfile(mappedChatSession.from, access_token)
			})
			.then(json => {
				console.log("'from' profile:" + JSON.stringify(json))
				mappedChatSession.profile = json
				return sessionsDb.saveSession(mappedChatSession)
			})
			.then(session => {
				return resolve(session)
			})
			.catch(error => {
				console.error("calling get user profile caught an error: " + error)
				reject(error)
			})
		}
	})
}


var removeSessionBySource = (source) => {
	return new Promise( resolve => { 
		let session = userChannelToSessions[source]
		if ( session ) {
			console.log("removeSessionBySource: removing session for source: " + source)
			delete userChannelToSessions[source]
			delete chatSessions[session.sessionId]
			sessionsDb.removeSession(session.sessionId)
				.then(sessionId => {
					resolve(sessionId)
				})
		}
		else {
			console.log("removeSessionBySource: no session was found for source: " + source)
			resolve(-1)
		}
	})
}

var handleResponseWithMessages = (messages, session) => {

	messages.forEach( (messageObj, index) => {
		//Delay or queue messages so we'll keep order in place
		setTimeout( () => {
			let channel = getChannel(session.channelType)
			switch (session.channelType) {
			// filtering by platofmr property but this will add unneccessary delays
			case CHANNELS.FB_MESSENGER:
			case CHANNELS.FB_WORKPLACE:
				if (!messageObj.platform || messageObj.platform.toLowerCase()=="facebook")  {    
					//convert obj        
					messageObj.payload = structjson.structProtoToJson(messageObj.payload)
					if (messageObj.message == "text") {
						messageObj.type = MESSAGE_TYPES.TEXT
					} else if (messageObj.message == "quickReplies") {
						messageObj.type = MESSAGE_TYPES.QUICK_REPLY
					} else {
						messageObj.type = MESSAGE_TYPES.CUSTOME
					}
					channel.sendMessage(messageObj, session)
				} else if (messageObj.platform == "PLATFORM_UNSPECIFIED") {
					channel.sendMessage(messageObj, session)
				}
				break
			case CHANNELS.NEXMO:
				if (!messageObj.platform) {
					channel.sendMessage(messageObj, session)
				}
				break
			}
		}, 1460 * index)
	})
}

const handleApiaiResponse = (apiairesponse) => {
	if (apiairesponse) {
		console.log("HANDLE APIAI RESPONSE", apiairesponse)
		let actionName = apiairesponse.action
		if ( actionName && actionName!=="input.unknown" ) {
			actionsManager.handleAction(apiairesponse.action, apiairesponse, getSessionBySessionId(apiairesponse.sessionId))
		}
        
		let messages = apiairesponse.fulfillmentMessages ? apiairesponse.fulfillmentMessages : [apiairesponse.result.fulfillmentText]
		// var filteredMessages = messages.filter(function (message) {
		// 	return message.text[0] != "" 
		// })
		// if (filteredMessages.length == 0) {
		// 	console.warn("handleApiaiResponse: No message to send")
		// 	return
		// }
		handleResponseWithMessages(messages, getSessionBySessionId(apiairesponse.sessionId))
	}
}

const handleInboundChannelMessage = (message) => {
	getSessionByChannelEvent(message)
		.then((session) => {
			console.log("session", session, "sessionsManager.handleInboundChannelMessage: " + JSON.stringify(message))
			if (message.quick_reply) {
				return getApiAiAgent(session.channelType).sendTextMessageToApiAi(unescape(message.quick_reply.payload), session.sessionId)
			}
			return getApiAiAgent(session.channelType).sendTextMessageToApiAi(message.text, session.sessionId)
		})
		.then(apiairesponse => {
			handleApiaiResponse(apiairesponse)
		})
		.catch(err => {
			console.error("sessionsManager.handleInboundChannelMessage caught an error: " + err)
		})
}

const handleInboundChannelPostback = (message) => {
	getSessionByChannelEvent(message)
		.then(session => {
			console.log("session", session, "sessionsManager.handleInboundChannelPostback: " + message)
			return getApiAiAgent(session.channelType).sendTextMessageToApiAi(unescape(message.payload), session.sessionId)
		})
		.then(apiairesponse => {
			handleApiaiResponse(apiairesponse)
		})
		.catch(err => {
			console.error("sessionsManager.handleInboundChannelPostback caught an error: " + err)
		})
}

const handleEventByUserChannelId = (userChannelId, event) => {
	let session = userChannelToSessions[userChannelId]
	if ( session ) {
		handleEvent(session, event)
	}
	else {
		console.log("sessionManager: couldn't find session for user channel ID: " + userChannelId)
	}
}

const handleEventBySessionId = (sessionId, event) => {
	let session = getSessionBySessionId(sessionId)
	handleEvent(session, event)
}

const handleEvent = (session, event) => {
	switch (event.type) {
	case EVENTS.GET_STARTED_PAYLOAD:
		getApiAiAgent(session.channelType).sendEventToApiAi(event, session.sessionId)
			.then(apiairesponse => {
				handleApiaiResponse(apiairesponse)
			})
		break
	case EVENTS.ACCOUNT_LINKED:
		session.externalIntegrations[event.data.integrationName] = {"User_ID": event.data.userId}
		userChannelToSessions[event.data.userId] = session /// do we need that?
		actionsManager.handleAction("accountLinked", event.data, session)
		break
	default:
		///TODO: REFACTOR. HANDLE PROPRIETARY EVENTS
		getApiAiAgent(session.channelType).sendEventToApiAi(event, session.sessionId)
			.then(apiairesponse => {
				handleApiaiResponse(apiairesponse)
			})
	}
}
/**
 * This allows Dialogflow events to be sent to different sources
 * @param {*} session //orginal session
 * @param {*} eventFunction  //function to call to act on new session
 * @param {*} sourceType //source to post message to
 * @param {*} channel //channel to post message to
 * @param {*} args //optional parameters that are passed into eventFunction

 */
const postEventToSource = (sourceType, session, eventFunction, args=null, channel) => {
	return new Promise(resolve => {
        createSessionByEvent(session, sourceType, channel)
            .then(session => {
					return new Promise(resolve => {
						if (eventFunction) {
							console.log("calling function ", eventFunction)
							eventFunction(session, args)
							setTimeout(() => {
								resolve(session)
							}, 3000)
						} else {
							console.error("No function to call")
							resolve(session)
						}
					})   
            }).then((session) => {
				resolve()
                // return removeSessionBySource(session.source)
            }).then(() => {
                resolve()
            })
    })
}

const createSessionByEvent = (session, sourceType, channel)  => {
    const messagingEvent = {
		source: session.from,
		from: session.from,
        sourceType: sourceType,
        channel: channel,
        profile: session.profile
    }
    return getSessionByChannelEvent(messagingEvent)
}

module.exports.handleInboundChannelPostback = handleInboundChannelPostback
module.exports.handleInboundChannelMessage = handleInboundChannelMessage
module.exports.getSessionBySessionId = getSessionBySessionId
module.exports.getSessionByChannelEvent = getSessionByChannelEvent
module.exports.inboundFacebookMessengerEvent = inboundFacebookMessengerEvent
module.exports.inboundFacebookWorkplaceEvent = inboundFacebookWorkplaceEvent
module.exports.inboundFacebookWorkplaceInstallEvent = inboundFacebookWorkplaceInstallEvent
module.exports.inboundFacebookWorkplaceUninstallEvent = inboundFacebookWorkplaceUninstallEvent
module.exports.postEventToSource = postEventToSource
module.exports.inboundNexmoEvent = inboundNexmoEvent
module.exports.MESSAGE_TYPES = MESSAGE_TYPES
module.exports.SOURCE_TYPE = SOURCE_TYPE
module.exports.CHANNELS = CHANNELS
module.exports.handleEventBySessionId = handleEventBySessionId
module.exports.handleEventByUserChannelId = handleEventByUserChannelId
module.exports.setDB = setDB
module.exports.setChannel = setChannel
module.exports.removeSessionBySource = removeSessionBySource
module.exports.updateSession = updateSession
module.exports.getApiAiAgent = getApiAiAgent
module.exports.getDB = getDB
module.exports.clearChatSessions = clearChatSessions
module.exports.getAllActiveSessions = getAllActiveSessions
