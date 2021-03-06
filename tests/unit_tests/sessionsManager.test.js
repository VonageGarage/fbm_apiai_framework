//Loads all .env variables into PROCESS.ENV
require("dotenv").config()
//Main Target File TO TEST
const sessionsManager = require("../../sessionsManager")
const firebaseDatabase = require("../../DB/firebase").firebaseDatabase

//Dependencies
const expect = require("chai").expect
const wpChannel = require("./../../channels/facebook/wphook")
const fbmChannel = require("./../../channels/facebook/fbmhook")
const httpResponse = require("./dependencies/httpResponse")
const nexmoChannel = require("./../../channels/nexmo/nexmohook")
const inboundWorkplaceGETEvent = require("./dependencies/inboundEvents/workplace/inboundWorkplaceGET")
const inboundWorkplacePagePOSTEvent = require("./dependencies/inboundEvents/workplace/inboundWorkplacePagePOST")

const describe = require("mocha").describe
const before = require("mocha").before
const it = require("mocha").it

describe("*****SessionsManager Test Suite: ", function() {

	before(() => {
		// runs before each test in this block
		sessionsManager.setDB(firebaseDatabase)
		sessionsManager.setChannel(sessionsManager.CHANNELS.FB_WORKPLACE, wpChannel, process.env.APIAI_TOKEN)
		sessionsManager.setChannel(sessionsManager.CHANNELS.FB_MESSENGER, fbmChannel, process.env.APIAI_TOKEN)
		sessionsManager.setChannel(sessionsManager.CHANNELS.NEXMO, nexmoChannel, process.env.APIAI_TOKEN)
	})

	/* beforeEach(() => {
		// runs before each test in this block
		agent = apiAi.getAgent(process.env.APIAI_TOKEN)
	}) */

	/* describe("Function: initializeDB() ", function() {
		it("should have an initialized DB", function() {
			var db = sessionsManager.returnDb()
			expect(db).to.exist
		})
	}) */

	/* describe("Function: initializeChannels() ", function() {

		it("should get session, sendTextMessageToApiAi, then handleApiaiResponse ", function() {
			var channels = sessionsManager.initializeChannels(fbmCh, wpCh, nexmoCh)

			expect(channels.length).to.equal(3)
			for (let channel of channels) {
				expect(channel).to.exist
				expect(channel.handleInboundEvent).to.exist
			}
		})
	}) */

	describe("Function: inboundFacebookWorkplaceEvent() ", function() {

		it("should handle TRUTHY inbound facebook workplace GET events", function() {
			sessionsManager.inboundFacebookWorkplaceEvent(inboundWorkplaceGETEvent, httpResponse)

			expect(httpResponse.statusCode).to.equal(200)
		})

		it("should handle FALSY inbound facebook workplace GET events", function() {
			inboundWorkplaceGETEvent.query["hub.mode"] = "test_false_scenario"
			var falsyEvent = inboundWorkplaceGETEvent

			sessionsManager.inboundFacebookWorkplaceEvent(falsyEvent, httpResponse)

			expect(httpResponse.statusCode).to.equal(403)
		})

		it("should handle TRUTHY inbound facebook workplace Page POST events", function() {
			var truthyEvent = inboundWorkplacePagePOSTEvent

			sessionsManager.inboundFacebookWorkplaceEvent(truthyEvent, httpResponse)

			expect(httpResponse.statusCode).to.equal(200)
		})
	})

	// describe('Function: inbound FacebookMessengerEvent() ', function() {

	//     it('should handle inbound facebook messenger events', function() {
	//         // sessionsManager.inboundFacebookMessengerEvent(req, res);

	//         expect(true).to.be.true
	//     });
	// });

	// describe('Function: inbound NexmoEvent() ', function() {

	//     it('should handle inbound Nexmo messenger events', function() {
	//         // sessionsManager.inboundNexmoEvent(req, res);

	//         expect(true).to.be.true
	//     });
	// });
})